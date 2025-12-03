
import { Hono } from "hono";
import { prisma } from "@repo/database";
import {
    hashToken,
    AUTHJS_GOOGLE_PROVIDER_ID,
    createOpaqueToken,
    createTokenHashEnvelope,
    SESSION_ABSOLUTE_MAX_AGE_SECONDS,
    SESSION_MAX_AGE_SECONDS
} from "@repo/auth";
import { setCookie } from "hono/cookie";


const callback = new Hono();
const WEB_APP_URL = process.env.WEB_APP_URL || "http://localhost:5173";

// --- Email / Magic Link ---

callback.get("/email", async (c) => {
    const token = c.req.query("token");
    const email = c.req.query("email");

    if (!token || !email) {
        return c.redirect(`${WEB_APP_URL}/login?error=InvalidLink`);
    }

    const hashed = hashToken(token);

    // Find verification token
    const record = await prisma.verificationToken.findFirst({
        where: {
            identifier: email,
            tokenHash: {
                path: ["hash"],
                equals: hashed.hash,
            },
        },
    });

    if (!record) {
        return c.redirect(`${WEB_APP_URL}/login?error=InvalidToken`);
    }

    if (record.expires < new Date()) {
        return c.redirect(`${WEB_APP_URL}/login?error=ExpiredToken`);
    }

    // Consume token
    await prisma.verificationToken.delete({ where: { id: record.id } });

    // Find/Create user
    const user = await prisma.user.findUnique({
        where: { emailLower: email.toLowerCase() },
    });

    if (!user) {
        return c.redirect(`${WEB_APP_URL}/login?error=UserNotFound`);
    }

    // Create Session
    const opaque = createOpaqueToken();
    const sessionTokenHash = createTokenHashEnvelope(opaque.tokenSecret);
    const now = new Date();
    const absoluteExpiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_MAX_AGE_SECONDS * 1000);
    const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);

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

    setCookie(c, "authjs.session-token", opaque.value, {
        path: "/",
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "Lax",
        maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return c.redirect(WEB_APP_URL);
});

// --- Google OAuth ---

callback.get("/google", async (c) => {
    const code = c.req.query("code");
    // const state = c.req.query("state");
    // const storedState = getCookie(c, "oauth_state");

    if (!code) {
        return c.redirect(`${WEB_APP_URL}/login?error=NoCode`);
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${process.env.AUTH_URL}/auth/callback/google`;

    if (!clientId || !clientSecret) {
        return c.redirect(`${WEB_APP_URL}/login?error=ConfigurationError`);
    }

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
        }),
    });

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
        console.error("Google token exchange failed", tokens);
        return c.redirect(`${WEB_APP_URL}/login?error=TokenExchangeFailed`);
    }

    // Get User Info
    const userResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    const googleUser = await userResponse.json();

    if (!userResponse.ok) {
        return c.redirect(`${WEB_APP_URL}/login?error=UserInfoFailed`);
    }

    const email = googleUser.email;
    const normalizedEmail = email.toLowerCase().trim();

    // Find or Create User
    let user = await prisma.user.findUnique({
        where: { emailLower: normalizedEmail },
    });

    if (!user) {
        user = await prisma.user.create({
            data: {
                email: email,
                emailLower: normalizedEmail,
                name: googleUser.name,
                image: googleUser.picture,
                status: "active",
            },
        });
    }

    // Link Identity
    await prisma.userIdentity.upsert({
        where: {
            provider_providerUserId: {
                provider: AUTHJS_GOOGLE_PROVIDER_ID,
                providerUserId: googleUser.sub,
            },
        },
        update: {
            email: email,
            emailVerified: googleUser.email_verified,
        },
        create: {
            userId: user.id,
            provider: AUTHJS_GOOGLE_PROVIDER_ID,
            providerUserId: googleUser.sub,
            email: email,
            emailVerified: googleUser.email_verified,
        },
    });

    // Create Session
    const opaque = createOpaqueToken();
    const sessionTokenHash = createTokenHashEnvelope(opaque.tokenSecret);
    const now = new Date();
    const absoluteExpiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_MAX_AGE_SECONDS * 1000);
    const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);

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

    setCookie(c, "authjs.session-token", opaque.value, {
        path: "/",
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "Lax",
        maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return c.redirect(WEB_APP_URL);
});

export { callback };
