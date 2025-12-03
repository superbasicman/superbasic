
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "@repo/database";
import {
    sendMagicLinkEmail,
    verifyPassword,
    AUTHJS_CREDENTIALS_PROVIDER_ID,
} from "@repo/auth";
import { authService } from "../../../lib/auth-service.js";
import { randomUUID } from "node:crypto";
import { hashToken } from "@repo/auth";
import { setCookie } from "hono/cookie";
import { SESSION_MAX_AGE_SECONDS } from "@repo/auth";

const signin = new Hono();

// --- Email / Magic Link ---

const emailSchema = z.object({
    email: z.string().email(),
    callbackUrl: z.string().optional(),
});

signin.post("/email", zValidator("json", emailSchema), async (c) => {
    const { email } = c.req.valid("json");
    const normalizedEmail = email.toLowerCase().trim();

    // 1. Find or create user (Upsert style for "sign up or sign in")
    // For now, we'll just check if user exists. If we want to support signup, we'd create here.
    // Let's assume we support signup for now to match typical "magic link" flows.
    let user = await prisma.user.findUnique({
        where: { emailLower: normalizedEmail },
    });

    if (!user) {
        user = await prisma.user.create({
            data: {
                email: email, // Keep original casing for display
                emailLower: normalizedEmail,
                status: "active",
            },
        });
    }

    // 2. Generate verification token
    const token = randomUUID();
    const hashed = hashToken(token);
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.verificationToken.create({
        data: {
            identifier: normalizedEmail,
            tokenId: randomUUID(), // DB internal ID
            tokenHash: hashed,
            expires,
        },
    });

    // 3. Send email
    const baseUrl = process.env.AUTH_URL || "http://localhost:3000";
    // The link points to the API callback, which will verify and redirect to frontend
    // OR it points to frontend which calls API.
    // Let's point to frontend to keep API stateless-ish regarding redirects if possible,
    // but standard pattern is link -> API -> Redirect to App.
    // Let's try: Link -> Frontend /auth/verify?token=... -> Frontend calls API /auth/callback/email

    const verifyUrl = `${baseUrl}/auth/verify?token=${token}&email=${encodeURIComponent(normalizedEmail)}`;

    await sendMagicLinkEmail({
        to: email,
        url: verifyUrl,
    });

    return c.json({ success: true, message: "Magic link sent" });
});

// --- Password ---

const passwordSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

signin.post("/password", zValidator("json", passwordSchema), async (c) => {
    const { email, password } = c.req.valid("json");
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
        where: { emailLower: normalizedEmail },
    });

    if (!user || !user.password) {
        // Return generic error to avoid enumeration
        return c.json({ error: "Invalid credentials" }, 401);
    }

    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
        return c.json({ error: "Invalid credentials" }, 401);
    }

    // Create session (using authService just to log/audit if needed, but we create DB record manually below)
    await authService.createSession({
        userId: user.id,
        clientType: "web",
        ipAddress: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null,
        userAgent: c.req.header("user-agent") || null,
        rememberMe: true,
        identity: {
            provider: AUTHJS_CREDENTIALS_PROVIDER_ID,
            providerUserId: user.id,
            email: user.email,
            emailVerified: !!user.emailVerified,
        },
    });

    // We need to return the opaque token to the client.
    // authService.createSession returns a SessionHandle which might not have the raw token if it's hashed?
    // Wait, authService.createSession implementation in auth-core/service.ts returns SessionHandle.
    // Let's check SessionHandle type in auth-core/types.ts or infer from service.ts return.
    // In service.ts: 
    // return { sessionId: created.id, ... }
    // It does NOT return the raw token secret! The raw token is only available inside createSession when it calls createOpaqueToken.
    // BUT `authService.createSession` in `packages/auth-core/src/service.ts` seems to NOT return the raw token?
    // Let's re-read `packages/auth-core/src/service.ts`.

    // Line 245: const opaque = createOpaqueToken();
    // Line 276: return { sessionId: created.id, ... }
    // It seems `authService.createSession` DOES NOT return the raw token. This is a problem for the API.
    // However, `apps/api/src/auth.ts` was using `authService.createSession` inside `(authConfig as any).createSession`.
    // But Auth.js was handling the token generation/storage in that case? No, `createSession` override was just returning sessionId.

    // Wait, if I use `authService.createSession`, I can't get the token to give to the user?
    // I might need to use `prisma` directly here to create the session so I have the token.
    // OR update `authService` to return the token.
    // Updating `authService` is better but might be out of scope/risky.
    // Let's look at `authService.createSession` again.

    // It seems I should use `prisma` directly for now to ensure I get the token, 
    // mirroring what `authService` does but keeping the token.
    // OR I can use `authService.createSessionWithRefresh`?
    // Let's check `createSessionWithRefresh` in `service.ts`.

    // It calls `createSession` and then `issueRefreshToken`.
    // `issueRefreshToken` returns `IssueRefreshTokenResult` which has `token` (IssuedToken) which has `secret`.
    // So if I use `createSessionWithRefresh`, I get a refresh token.
    // But I need a session token (access token equivalent or session cookie).

    // Actually, for a "web" client, we usually want a session token (cookie).
    // The `auth-core` seems designed for "Access Token + Refresh Token" flow or "Opaque Session Token".
    // If `authService.createSession` creates an opaque token but doesn't return it, it's useless for the caller who needs to set the cookie.

    // I will implement session creation directly here using `prisma` and `@repo/auth` utils to ensure I have the token.

    const { createOpaqueToken, createTokenHashEnvelope, SESSION_ABSOLUTE_MAX_AGE_SECONDS } = await import("@repo/auth");

    const opaque = createOpaqueToken();
    const sessionTokenHash = createTokenHashEnvelope(opaque.tokenSecret);
    const now = new Date();
    const absoluteExpiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_MAX_AGE_SECONDS * 1000);
    const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000); // Sliding window

    await prisma.session.create({
        data: {
            userId: user.id,
            tokenId: opaque.tokenId,
            sessionTokenHash,
            expiresAt,
            absoluteExpiresAt,
            clientType: "web",
            kind: "default",
            lastUsedAt: now,
            mfaLevel: "none",
            ipAddress: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null,
            userAgent: c.req.header("user-agent") || null,
        },
    });

    // Set cookie
    setCookie(c, "authjs.session-token", opaque.value, {
        path: "/",
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "Lax",
        maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return c.json({
        success: true,
        user: { id: user.id, email: user.email, name: user.name }
    });
});

// --- Google OAuth ---

signin.post("/google", async (c) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = `${process.env.AUTH_URL}/auth/callback/google`; // API callback
    // OR frontend callback? Usually API callback handles code exchange.

    if (!clientId) {
        return c.json({ error: "Google auth not configured" }, 500);
    }

    const state = randomUUID();
    const scope = "openid email profile";
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}`;

    // We might want to store state in a cookie to verify it later
    setCookie(c, "oauth_state", state, {
        path: "/",
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "Lax",
        maxAge: 600, // 10 min
    });

    return c.json({ url });
});

export { signin };
