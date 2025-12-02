/**
 * Auth.js core configuration
 * Provides JWT-based session management with credentials provider
 */

import { skipCSRFCheck } from "@auth/core";
import type { AuthConfig } from "@auth/core";
import type { Adapter } from "@auth/core/adapters";
import Credentials from "@auth/core/providers/credentials";
import Google from "@auth/core/providers/google";
import Nodemailer from "@auth/core/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { SignJWT, importPKCS8, jwtVerify } from "jose";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@repo/database";
import { encode as defaultJwtEncode, decode as defaultJwtDecode } from "@auth/core/jwt";
import { verifyPassword } from "./password.js";

function logAuthDebug(event: string, data: Record<string, unknown>) {
  const shouldLog = process.env.AUTH_DEBUG === "1" && process.env.NODE_ENV !== "production";
  if (!shouldLog) {
    return;
  }
  try {
    console.error("[auth][debug]", event, JSON.stringify(data));
  } catch {
    // Best-effort logging only
  }
}
import { sendMagicLinkEmail, getRecipientLogId } from "./email.js";
import {
  SESSION_MAX_AGE_SECONDS,
  SESSION_ABSOLUTE_MAX_AGE_SECONDS,
  AUTHJS_CREDENTIALS_PROVIDER_ID,
  AUTHJS_GOOGLE_PROVIDER_ID,
  AUTHJS_EMAIL_PROVIDER_ID,
} from "./constants.js";
import { ensureProfileExists } from "./profile.js";
import { hashToken } from "./pat.js";
import {
  createTokenHashEnvelope,
  verifyTokenSecret,
  parseOpaqueToken,
  createOpaqueToken,
} from "./token-hash.js";
import type { TokenHashEnvelope } from "./token-hash.js";
import { randomUUID } from "node:crypto";
import { authEvents } from "./events.js";

const MIN_AUTH_SECRET_LENGTH = 32;
const LOW_ENTROPY_THRESHOLD = 16;
const DISALLOWED_SECRETS = new Set([
  "",
  "changeme",
  "default",
  "your-super-secret-auth-key-min-32-chars-change-in-production",
]);

const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const DEFAULT_JWT_CLOCK_TOLERANCE_SECONDS = 60;

function ensureAuthSecret(rawSecret: string | undefined): string {
  if (!rawSecret) {
    throw new Error(
      "AUTH_SECRET is required and must be set to a secure random value (32+ characters)."
    );
  }

  const secret = rawSecret.trim();

  if (secret.length < MIN_AUTH_SECRET_LENGTH) {
    throw new Error(
      `AUTH_SECRET must be at least ${MIN_AUTH_SECRET_LENGTH} characters; received ${secret.length}.`
    );
  }

  if (DISALLOWED_SECRETS.has(secret.toLowerCase())) {
    throw new Error("AUTH_SECRET cannot use the documented placeholder value.");
  }

  const uniqueChars = new Set(secret.split(""));

  if (uniqueChars.size < LOW_ENTROPY_THRESHOLD) {
    throw new Error(
      "AUTH_SECRET appears low-entropy; generate a random value (e.g., `openssl rand -base64 32`)."
    );
  }

  return secret;
}

const AUTH_SECRET = ensureAuthSecret(process.env.AUTH_SECRET);
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SESSION_COOKIE_NAME = "authjs.session-token";

type AuthJwtConfig = {
  issuer: string;
  audience: string;
  algorithm: "EdDSA" | "RS256";
  keyId: string;
  privateKeyPem: string;
  clockToleranceSeconds: number;
};

function decodeKeyMaterial(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("-----BEGIN")) {
    return trimmed;
  }

  return Buffer.from(trimmed, "base64").toString("utf8");
}

function readPrivateKeyPem(env: NodeJS.ProcessEnv): string {
  if (env.AUTH_JWT_PRIVATE_KEY_FILE) {
    const path = resolve(env.AUTH_JWT_PRIVATE_KEY_FILE);
    return readFileSync(path, "utf8");
  }

  const raw = env.AUTH_JWT_PRIVATE_KEY;
  if (!raw) {
    throw new Error(
      "AUTH_JWT_PRIVATE_KEY or AUTH_JWT_PRIVATE_KEY_FILE must be set to sign access tokens."
    );
  }

  return decodeKeyMaterial(raw);
}

function loadAuthJwtConfig(env: NodeJS.ProcessEnv = process.env): AuthJwtConfig {
  const issuer = env.AUTH_JWT_ISSUER ?? env.AUTH_URL ?? "http://localhost:3000";
  const audience = env.AUTH_JWT_AUDIENCE ?? `${issuer}/v1`;
  const algorithm = (env.AUTH_JWT_ALGORITHM ?? "EdDSA") as "EdDSA" | "RS256";
  const keyId = env.AUTH_JWT_KEY_ID ?? "dev-access-key";

  if (algorithm !== "EdDSA" && algorithm !== "RS256") {
    throw new Error(`Unsupported AUTH_JWT_ALGORITHM value: ${algorithm}`);
  }

  return {
    issuer,
    audience,
    algorithm,
    keyId,
    privateKeyPem: readPrivateKeyPem(env),
    clockToleranceSeconds:
      Number.parseInt(env.AUTH_JWT_CLOCK_TOLERANCE_SECONDS ?? "", 10) ||
      DEFAULT_JWT_CLOCK_TOLERANCE_SECONDS,
  };
}

const AUTH_JWT_CONFIG = loadAuthJwtConfig();
let signingKeyPromise: Promise<import("jose").KeyLike> | null = null;

async function getSigningKey() {
  if (!signingKeyPromise) {
    signingKeyPromise = importPKCS8(
      AUTH_JWT_CONFIG.privateKeyPem,
      AUTH_JWT_CONFIG.algorithm === "EdDSA" ? "Ed25519" : "RS256"
    );
  }
  return signingKeyPromise;
}

async function signAccessToken(params: { userId: string; sessionId: string }) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const exp = issuedAt + DEFAULT_ACCESS_TOKEN_TTL_SECONDS;
  const payload = {
    sub: params.userId,
    sid: params.sessionId,
    token_use: "access",
    jti: randomUUID(),
    client_type: "web",
    reauth_at: issuedAt,
  };

  const signingKey = await getSigningKey();

  return await new SignJWT(payload)
    .setProtectedHeader({
      alg: AUTH_JWT_CONFIG.algorithm,
      kid: AUTH_JWT_CONFIG.keyId,
      typ: "JWT",
    })
    .setIssuedAt(issuedAt)
    .setExpirationTime(exp)
    .setIssuer(AUTH_JWT_CONFIG.issuer)
    .setAudience(AUTH_JWT_CONFIG.audience)
    .sign(signingKey);
}

async function verifyAccessToken(raw: string) {
  const signingKey = await getSigningKey();
  return jwtVerify(raw, signingKey, {
    issuer: AUTH_JWT_CONFIG.issuer,
    audience: AUTH_JWT_CONFIG.audience,
    clockTolerance: AUTH_JWT_CONFIG.clockToleranceSeconds,
  });
}

type RequestMetadata = {
  ip: string;
  userAgent: string;
  requestId?: string | null;
};

function extractRequestMetadata(req?: Request | null): RequestMetadata {
  const headers = req?.headers;
  const forwarded = headers?.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    headers?.get("x-real-ip") ||
    "unknown";

  return {
    ip,
    userAgent: headers?.get("user-agent") || "unknown",
    requestId:
      headers?.get("x-request-id") ||
      headers?.get("x-correlation-id") ||
      null,
  };
}

function emitLoginAudit(
  type: "user.login.success" | "user.login.failed",
  params: {
    provider: string;
    email?: string | null;
    userId?: string;
    reason?: string;
    request?: Request | null;
  }
) {
  const metadata = extractRequestMetadata(params.request);

  void authEvents.emit({
    type,
    ...(params.userId ? { userId: params.userId } : {}),
    ...(params.email ? { email: params.email } : {}),
    metadata: {
      provider: params.provider,
      ip: metadata.ip,
      userAgent: metadata.userAgent,
      requestId: metadata.requestId,
      timestamp: new Date().toISOString(),
      ...(params.reason ? { reason: params.reason } : {}),
    },
  });
}

async function persistSessionToken(userId: string, expires: Date) {
  const now = new Date();
  const absoluteExpiresAt = new Date(
    now.getTime() + SESSION_ABSOLUTE_MAX_AGE_SECONDS * 1000
  );
  const opaque = createOpaqueToken();
  const created = await prisma.session.create({
    data: {
      userId,
      tokenId: opaque.tokenId,
      sessionTokenHash: createTokenHashEnvelope(opaque.tokenSecret),
      expiresAt: expires,
      clientType: "web",
      kind: "default",
      lastUsedAt: now,
      absoluteExpiresAt,
    },
  });
  return {
    sessionId: created.id,
    opaqueToken: opaque.value,
    absoluteExpiresAt,
  };
}


function createPrismaAdapterWithLowercaseEmail(): Adapter {
  const baseAdapter = PrismaAdapter(prisma);
  const adapter: Adapter = { ...baseAdapter };

  adapter.getUserByEmail = async (email) => {
    if (!email) return null;
    const normalized = email.trim().toLowerCase();
    return prisma.user.findUnique({
      where: { emailLower: normalized },
    });
  };

  adapter.createUser = async (data) => {
    const normalized = data.email?.trim().toLowerCase();
    return prisma.user.create({
      data: {
        ...data,
        emailLower: normalized ?? data.email ?? "",
      },
    });
  };

  adapter.createVerificationToken = async (data) => {
    const tokenId = randomUUID();
    const tokenHash = hashToken(data.token);

    const record = await prisma.verificationToken.create({
      data: {
        identifier: data.identifier,
        tokenId,
        tokenHash,
        expires: data.expires,
      },
    });

    return {
      identifier: record.identifier,
      token: data.token,
      expires: record.expires,
    };
  };

  adapter.useVerificationToken = async (params) => {
    const hashed = hashToken(params.token);

    const record = await prisma.verificationToken.findFirst({
      where: {
        identifier: params.identifier,
        tokenHash: {
          path: ["hash"],
          equals: hashed.hash,
        },
      },
    });

    if (!record) {
      return null;
    }

    await prisma.verificationToken.delete({
      where: { id: record.id },
    });

    return {
      identifier: record.identifier,
      token: params.token,
      expires: record.expires,
    };
  };

  adapter.createSession = async (session) => {
    const parsed = parseOpaqueToken(session.sessionToken);
    if (!parsed) {
      throw new Error("Invalid session token format");
    }

    const sessionHash = createTokenHashEnvelope(parsed.tokenSecret);
    const now = new Date();
    const absoluteExpiresAt = new Date(
      now.getTime() + SESSION_ABSOLUTE_MAX_AGE_SECONDS * 1000
    );
    const created = await prisma.session.create({
      data: {
        userId: session.userId,
        tokenId: parsed.tokenId,
        sessionTokenHash: sessionHash,
        expiresAt: session.expires,
        clientType: "web",
        kind: "default",
        lastUsedAt: now,
        absoluteExpiresAt,
      },
    });
    return {
      sessionToken: session.sessionToken,
      userId: created.userId,
      expires: created.expiresAt,
    };
  };

  adapter.getSessionAndUser = async (sessionToken) => {
    const parsed = parseOpaqueToken(sessionToken);
    if (!parsed) {
      return null;
    }

    const record = await prisma.session.findUnique({
      where: { tokenId: parsed.tokenId },
      include: {
        user: true,
      },
    });

    if (!record) {
      return null;
    }

    if (
      !verifyTokenSecret(parsed.tokenSecret, record.sessionTokenHash as TokenHashEnvelope)
    ) {
      await prisma.session
        .delete({ where: { id: record.id } })
        .catch(() => { });
      return null;
    }

    if (record.expiresAt < new Date()) {
      await prisma.session
        .delete({ where: { id: record.id } })
        .catch(() => { });
      return null;
    }

    return {
      session: {
        sessionToken,
        userId: record.userId,
        expires: record.expiresAt,
      },
      user: record.user as any,
    };
  };

  adapter.updateSession = async (session) => {
    const parsed = parseOpaqueToken(session.sessionToken);
    if (!parsed) {
      return null;
    }

    const updated = await prisma.session.update({
      where: { tokenId: parsed.tokenId },
      data: {
        ...(session.expires ? { expiresAt: session.expires } : {}),
      },
    });

    return {
      sessionToken: session.sessionToken,
      userId: updated.userId,
      expires: updated.expiresAt,
    };
  };

  adapter.deleteSession = async (sessionToken) => {
    const parsed = parseOpaqueToken(sessionToken);
    if (!parsed) {
      return null;
    }

    try {
      const deleted = await prisma.session.delete({
        where: { tokenId: parsed.tokenId },
      });
      return {
        sessionToken,
        userId: deleted.userId,
        expires: deleted.expiresAt,
      };
    } catch {
      return null;
    }
  };

  return adapter;
}

// Extend Auth.js config type to include email-based linking override (not yet typed upstream).
type AuthConfigWithLinking = AuthConfig & {
  allowDangerousEmailAccountLinking?: boolean;
  createSession?: (params: {
    userId: string;
    ipAddress: string | null;
    userAgent: string | null;
    identity: {
      provider: string;
      providerUserId: string;
      email?: string | null;
      emailVerified?: boolean;
    };
  }) => Promise<{ sessionId: string }>;
};

const credentialsProvider = Credentials({
  id: AUTHJS_CREDENTIALS_PROVIDER_ID,
  name: "Credentials",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" },
  },
  async authorize(credentials, req) {
    try {
      const request = (req as any)?.request ?? (req as Request | undefined);
      const provider = AUTHJS_CREDENTIALS_PROVIDER_ID;

      if (!credentials?.email || !credentials?.password) {
        logAuthDebug("credentials_authorize", {
          reason: "missing_email_or_password",
        });
        emitLoginAudit("user.login.failed", {
          provider,
          email: credentials?.email?.toString() ?? null,
          reason: "missing_email_or_password",
          request: request ?? null,
        });
        return null;
      }

      const rawEmail = String(credentials.email).trim();
      const normalized = rawEmail.toLowerCase();

      console.error("[auth][debug] credentials_authorize_invoked", {
        email: rawEmail,
        normalized,
      });
      logAuthDebug("credentials_authorize_start", { email: rawEmail });

      // Prefer the canonical emailLower column but gracefully fall back to the
      // legacy email field for any users that haven't been backfilled yet.
      const user =
        (await prisma.user.findUnique({
          where: { emailLower: normalized },
        })) ??
        (await prisma.user.findFirst({
          where: {
            email: {
              equals: rawEmail,
              mode: "insensitive",
            },
          },
        }));

      if (!user || !user.password) {
        logAuthDebug("credentials_authorize", {
          email: rawEmail,
          reason: "user_not_found_or_missing_password",
        });
        emitLoginAudit("user.login.failed", {
          provider,
          email: rawEmail,
          reason: "user_not_found_or_missing_password",
          request: request ?? null,
        });
        return null;
      }

      const isValid = await verifyPassword(
        credentials.password as string,
        user.password
      );

      if (!isValid) {
        logAuthDebug("credentials_authorize", {
          email: rawEmail,
          reason: "invalid_password",
        });
        emitLoginAudit("user.login.failed", {
          provider,
          email: rawEmail,
          reason: "invalid_password",
          request: request ?? null,
        });
        return null;
      }

      logAuthDebug("credentials_authorize_success", {
        email: rawEmail,
        userId: user.id,
      });

      emitLoginAudit("user.login.success", {
        provider,
        userId: user.id,
        email: user.email ?? rawEmail,
        request: request ?? null,
      });

      return {
        id: user.id,
        email: user.email,
        name: user.name ?? null,
      };
    } catch (error) {
      logAuthDebug("credentials_authorize_error", {
        email: credentials?.email ?? null,
        message: error instanceof Error ? error.message : "unknown_error",
      });
      throw error;
    }
  },
}) as any;

// Ensure provider id stays namespaced (Auth.js providers may override id internally)
credentialsProvider.id = AUTHJS_CREDENTIALS_PROVIDER_ID;

const googleProvider = Google({
  id: AUTHJS_GOOGLE_PROVIDER_ID,
  name: "Google",
  clientId: process.env.GOOGLE_CLIENT_ID || "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  authorization: {
    params: {
      // prompt: "consent",
      access_type: "offline",
      response_type: "code"
    }
  }
}) as any;
googleProvider.id = AUTHJS_GOOGLE_PROVIDER_ID;

const config: AuthConfigWithLinking = {
  basePath: "/v1/auth",
  trustHost: true, // Trust the host from AUTH_URL or request headers
  adapter: createPrismaAdapterWithLowercaseEmail(), // For OAuth & magic link flows
  // With zero legacy users, allow linking by email across providers to avoid OAuthAccountNotLinked loops.
  allowDangerousEmailAccountLinking: true,
  cookies: {
    sessionToken: {
      name: SESSION_COOKIE_NAME,
      options: {
        httpOnly: true,
        sameSite: "lax", // Same-site cookies (api.superbasicfinance.com and www.superbasicfinance.com)
        path: "/",
        secure: IS_PRODUCTION, // allow http://localhost during development
      },
    },
    csrfToken: {
      name: "authjs.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "lax", // Same-site cookies for CSRF protection
        path: "/",
        secure: IS_PRODUCTION,
      },
    },
  },
  providers: [
    credentialsProvider,
    googleProvider,
    (() => {
      const emailProvider = Nodemailer({
        id: AUTHJS_EMAIL_PROVIDER_ID,
        from: process.env.EMAIL_FROM ?? "onboard@resend.com",
        // Server config required by Auth.js Nodemailer provider
        // We override sendVerificationRequest so this isn't actually used
        server: {
          host: "localhost",
          port: 25,
          auth: {
            user: "",
            pass: "",
          },
          secure: false,
          tls: {
            rejectUnauthorized: false,
          },
        },
        sendVerificationRequest: async ({ identifier: email, url }) => {
          const recipient = getRecipientLogId(email);
          console.log("[Auth.js] sendVerificationRequest called:", {
            recipient,
            urlLength: url.length,
          });
          try {
            await sendMagicLinkEmail({ to: email, url });
            console.log("[Auth.js] sendMagicLinkEmail completed successfully:", {
              recipient,
            });
          } catch (error) {
            console.error("[Auth.js] sendMagicLinkEmail failed:", {
              recipient,
              error,
            });
            throw error;
          }
        },
      }) as any; // Type cast to avoid Auth.js provider type strictness issues
      emailProvider.id = AUTHJS_EMAIL_PROVIDER_ID;
      return emailProvider;
    })(),
  ],
  jwt: {
    async encode(params) {
      const token = params.token as Record<string, unknown> | null | undefined;
      const accessToken = token?.accessToken;
      if (typeof accessToken === "string") {
        return accessToken;
      }
      return defaultJwtEncode(params);
    },
    async decode(params) {
      const raw = params.token;
      if (typeof raw === "string") {
        try {
          const verification = await verifyAccessToken(raw);
          const payload = verification.payload as Record<string, unknown>;

          if (payload.token_use !== "access") {
            return null;
          }

          const userId = typeof payload.sub === "string" ? payload.sub : null;
          const sessionId = typeof payload.sid === "string" ? payload.sid : null;

          if (!userId) {
            return null;
          }

          let email: string | null = null;

          if (sessionId) {
            const session = await prisma.session.findUnique({
              where: { id: sessionId },
              include: {
                user: {
                  select: { id: true, email: true, status: true },
                },
              },
            });

            if (!session || session.userId !== userId) {
              return null;
            }

            const now = new Date();
            if (session.revokedAt || session.expiresAt < now) {
              return null;
            }

            if (session.absoluteExpiresAt && session.absoluteExpiresAt < now) {
              return null;
            }

            if (session.user.status !== "active") {
              return null;
            }

            email = session.user.email;
          } else {
            const user = await prisma.user.findUnique({
              where: { id: userId },
              select: { email: true, status: true },
            });
            if (!user || user.status !== "active") {
              return null;
            }
            email = user.email;
          }

          return {
            sub: userId,
            id: userId,
            sid: sessionId ?? undefined,
            email,
            token_use: payload.token_use,
            accessToken: raw,
          };
        } catch {
          return null;
        }
      }
      return defaultJwtDecode(params);
    },
  },
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  secret: AUTH_SECRET,
  callbacks: {
    async signIn({ user, account, profile: oauthProfile, request }: any) {
      const provider = account?.provider ?? "unknown";
      const rawRequest = (request as Request | undefined) ?? undefined;

      if (!account) {
        emitLoginAudit("user.login.failed", {
          provider,
          email: user?.email ?? null,
          reason: "missing_account",
          request: rawRequest ?? null,
        });
        return false;
      }

      if (account.provider === AUTHJS_CREDENTIALS_PROVIDER_ID) {
        return true;
      }

      const normalizedEmail = user.email?.trim().toLowerCase();
      if (!normalizedEmail) {
        emitLoginAudit("user.login.failed", {
          provider,
          email: user?.email ?? null,
          reason: "missing_email",
          request: rawRequest ?? null,
        });
        return false;
      }

      try {
        const existingUser = await prisma.user.findUnique({
          where: { emailLower: normalizedEmail },
        });

        let userId: string;

        if (!existingUser) {
          const newUser = await prisma.user.create({
            data: {
              email: user.email!,
              emailLower: normalizedEmail,
              name: user.name || oauthProfile?.name || null,
              image: user.image || oauthProfile?.picture || null,
              emailVerified: account.provider === AUTHJS_EMAIL_PROVIDER_ID ? null : new Date(),
            },
          });
          userId = newUser.id;
        } else {
          userId = existingUser.id;
        }

        await ensureProfileExists(userId);

        if (account.provider !== AUTHJS_EMAIL_PROVIDER_ID) {
          const existingAccount = await prisma.account.findUnique({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            },
          });

          if (!existingAccount) {
            await prisma.account.create({
              data: {
                userId,
                type: account.type,
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            });
          }
        }

        // Attach metadata to user object so it's available in the JWT callback
        (user as any).ipAddress = (rawRequest as any)?.ip ?? extractRequestMetadata(rawRequest).ip;
        (user as any).userAgent = (rawRequest as any)?.userAgent ?? extractRequestMetadata(rawRequest).userAgent;

        emitLoginAudit("user.login.success", {
          provider,
          userId,
          email: user.email ?? normalizedEmail,
          request: rawRequest ?? null,
        });

        return true;
      } catch (error) {
        emitLoginAudit("user.login.failed", {
          provider,
          email: user?.email ?? normalizedEmail,
          reason: "sign_in_error",
          request: rawRequest ?? null,
        });
        throw error;
      }
    },
    async jwt({ token, user, account }) {
      if (user) {
        if (!user.id) {
          return token;
        }

        let sessionId: string;
        const ipAddress = (user as any).ipAddress ?? null;
        const userAgent = (user as any).userAgent ?? null;

        // Use injected createSession if available (Unified Auth Flow)
        if (typeof (config as any).createSession === 'function' && account) {
          const result = await (config as any).createSession({
            userId: user.id,
            ipAddress,
            userAgent,
            identity: {
              provider: account.provider,
              providerUserId: account.providerAccountId,
              email: user.email,
              // Auth.js providers usually verify email, or we trust them
              emailVerified: true,
            },
          });
          sessionId = result.sessionId;
        } else {
          // Fallback to legacy behavior
          const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
          const result = await persistSessionToken(user.id, expires);
          sessionId = result.sessionId;
        }

        const accessToken = await signAccessToken({
          userId: user.id,
          sessionId,
        });
        return {
          accessToken,
          sessionId,
          id: user.id,
          email: user.email ?? null,
        };
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = (token as any).id as string;
        session.user.email = ((token as any).email as string) ?? session.user.email;
        (session as any).accessToken = (token as any).accessToken;
        (session as any).sessionId = (token as any).sessionId;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      const webAppUrl = process.env.WEB_APP_URL || "http://localhost:5173";

      // If url is already pointing to the web app, return as-is
      if (url.startsWith(webAppUrl)) {
        return url;
      }

      // If url is relative, prepend web app URL
      if (url.startsWith('/')) {
        return `${webAppUrl}${url}`;
      }

      // If url starts with baseUrl (API server), extract the path and redirect to web app
      if (url.startsWith(baseUrl)) {
        const path = url.substring(baseUrl.length);
        return `${webAppUrl}${path}`;
      }

      // For external URLs (OAuth providers), return as-is
      return url;
    },
  },
  pages: {
    // Don't set pages - let redirect callback handle all redirects
    // This ensures WEB_APP_URL is evaluated at request time, not module load time
  },
  skipCSRFCheck,
};

export const authConfig: AuthConfig = config;
