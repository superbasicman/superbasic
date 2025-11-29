/**
 * Auth.js core configuration
 * Provides JWT-based session management with credentials provider
 */

import type { AuthConfig } from "@auth/core";
import type { Adapter } from "@auth/core/adapters";
import Credentials from "@auth/core/providers/credentials";
import Google from "@auth/core/providers/google";
import Nodemailer from "@auth/core/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
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
import { SESSION_MAX_AGE_SECONDS, SESSION_ABSOLUTE_MAX_AGE_SECONDS } from "./constants.js";
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
  await prisma.session.create({
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
  return opaque.value;
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
        .catch(() => {});
      return null;
    }

    if (record.expiresAt < new Date()) {
      await prisma.session
        .delete({ where: { id: record.id } })
        .catch(() => {});
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

export const authConfig: AuthConfig = {
  basePath: "/v1/auth",
  trustHost: true, // Trust the host from AUTH_URL or request headers
  adapter: createPrismaAdapterWithLowercaseEmail(), // For OAuth & magic link flows
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
    Credentials({
	      credentials: {
	        email: { label: "Email", type: "email" },
	        password: { label: "Password", type: "password" },
	      },
      async authorize(credentials, req) {
        try {
          const request = (req as any)?.request ?? (req as Request | undefined);
          const provider = "credentials";

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
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          // prompt: "consent",
          access_type: "offline",
          response_type: "code"
        }
      }
    }),
    Nodemailer({
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
    }) as any, // Type cast to avoid Auth.js provider type strictness issues
  ],
  jwt: {
    async encode(params) {
      const token = params.token as Record<string, unknown> | null | undefined;
      const sessionTokenValue = token?.sessionTokenValue;
      if (typeof sessionTokenValue === "string") {
        return sessionTokenValue;
      }
      return defaultJwtEncode(params);
    },
    async decode(params) {
      const raw = params.token;
      if (typeof raw === "string") {
        const parsed = parseOpaqueToken(raw);
        if (parsed) {
          const record = await prisma.session.findUnique({
            where: { tokenId: parsed.tokenId },
            include: {
              user: {
                select: { id: true, email: true },
              },
            },
          });
          if (!record) {
            return null;
          }
          const isValid = verifyTokenSecret(
            parsed.tokenSecret,
            record.sessionTokenHash as TokenHashEnvelope
          );
          if (!isValid || record.expiresAt < new Date()) {
            await prisma.session
              .delete({ where: { id: record.id } })
              .catch(() => {});
            return null;
          }
          return {
            sub: record.userId,
            email: record.user.email,
            sessionTokenValue: raw,
            id: record.userId,
          };
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

      if (account.provider === "credentials") {
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
              emailVerified: account.provider === "email" ? null : new Date(),
            },
          });
          userId = newUser.id;
        } else {
          userId = existingUser.id;
        }

        await ensureProfileExists(userId);

        if (account.provider !== "email") {
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
    async jwt({ token, user }) {
      if (user) {
        if (!user.id) {
          return token;
        }
        const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
        const sessionTokenValue = await persistSessionToken(user.id, expires);
        return {
          sessionTokenValue,
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
};
