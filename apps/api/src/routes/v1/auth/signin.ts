
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { setCookie } from "hono/cookie";
import { prisma } from "@repo/database";
import {
    verifyPassword,
    LOCAL_PASSWORD_PROVIDER_ID,
    COOKIE_NAME,
} from "@repo/auth";
import { authService } from "../../../lib/auth-service.js";
import { setRefreshTokenCookie } from "./refresh-cookie.js";
import { generateAccessToken } from "@repo/auth-core";

const signin = new Hono();

// --- Password ---

const passwordSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

signin.post("/password", zValidator("json", passwordSchema), async (c) => {
    const { email, password } = c.req.valid("json");
    const normalizedEmail = email.toLowerCase().trim();

    const user = (await prisma.user.findFirst({
        where: {
            primaryEmail: normalizedEmail,
            deletedAt: null,
        },
        include: {
            password: true,
        },
    })) as (Awaited<ReturnType<typeof prisma.user.findFirst>> & { password?: { passwordHash: string } | null }) | null;

    if (!user || !user.password?.passwordHash) {
        // Return generic error to avoid enumeration
        return c.json({ error: "Invalid credentials" }, 401);
    }

    const isValid = await verifyPassword(password, user.password.passwordHash);
    if (!isValid) {
        return c.json({ error: "Invalid credentials" }, 401);
    }

    const ipAddress = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null;
    const userAgent = c.req.header("user-agent") || null;

    const { session, refresh } = await authService.createSessionWithRefresh({
        userId: user.id,
        clientType: "web",
        ipAddress,
        userAgent,
        rememberMe: true,
        identity: {
            provider: LOCAL_PASSWORD_PROVIDER_ID,
            providerUserId: user.id,
            email: user.primaryEmail,
            emailVerified: !!user.emailVerified,
        },
    });

    // Set session cookie so OAuth authorize can find the session
    setCookie(c, COOKIE_NAME, session.sessionId, {
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60, // 30 days
        sameSite: 'Lax',
    });

    setRefreshTokenCookie(c, refresh.refreshToken, refresh.token.expiresAt);

    const { token: accessToken } = await generateAccessToken({
        userId: user.id,
        sessionId: session.sessionId,
        clientType: session.clientType,
        mfaLevel: session.mfaLevel,
        reauthenticatedAt: Math.floor(Date.now() / 1000),
    });

    return c.json({
        success: true,
        accessToken,
        sessionId: session.sessionId,
        user: { id: user.id, email: user.primaryEmail, name: user.displayName ?? null }
    });
});

export { signin };
