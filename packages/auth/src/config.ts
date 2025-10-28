/**
 * Auth.js core configuration
 * Provides JWT-based session management with credentials provider
 */

import type { AuthConfig } from "@auth/core";
import Credentials from "@auth/core/providers/credentials";
import Google from "@auth/core/providers/google";
import Nodemailer from "@auth/core/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@repo/database";
import { verifyPassword } from "./password.js";
import { sendMagicLinkEmail } from "./email.js";
import { SESSION_MAX_AGE_SECONDS } from "./constants.js";
import { ensureProfileExists } from "./profile.js";

export const authConfig: AuthConfig = {
  basePath: "/v1/auth",
  trustHost: true, // Trust the host from AUTH_URL or request headers
  adapter: PrismaAdapter(prisma), // For future OAuth; unused with JWT strategy
  cookies: {
    sessionToken: {
      name: "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "none", // Required for cross-origin (API and web on different domains)
        path: "/",
        secure: true, // Required when sameSite=none (HTTPS only)
      },
    },
    csrfToken: {
      name: "authjs.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "none", // Required for cross-origin CSRF protection
        path: "/",
        secure: true, // Required when sameSite=none (HTTPS only)
      },
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // Normalize email to lowercase
        const email = String(credentials.email).trim().toLowerCase();

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.password) {
          return null;
        }

        const isValid = await verifyPassword(
          credentials.password as string,
          user.password
        );

        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
        };
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
        console.log('[Auth.js] sendVerificationRequest called:', { email, urlLength: url.length });
        try {
          await sendMagicLinkEmail({ to: email, url });
          console.log('[Auth.js] sendMagicLinkEmail completed successfully');
        } catch (error) {
          console.error('[Auth.js] sendMagicLinkEmail failed:', error);
          throw error;
        }
      },
    }) as any, // Type cast to avoid Auth.js provider type strictness issues
  ],
  session: {
    strategy: "jwt", // Stateless sessions; no database session rows created
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  secret: process.env.AUTH_SECRET || "",
  callbacks: {
    async signIn({ user, account, profile: oauthProfile }) {
      // For OAuth and magic link providers, ensure user and profile exist
      if (account?.provider && account.provider !== 'credentials') {
        // Check if user exists
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email! },
        });

        let userId: string;

        if (!existingUser) {
          // Create user for OAuth/magic link
          const newUser = await prisma.user.create({
            data: {
              email: user.email!,
              name: user.name || oauthProfile?.name || null,
              image: user.image || oauthProfile?.picture || null,
              emailVerified: new Date(), // OAuth users are email-verified
            },
          });
          userId = newUser.id;
          
          // Create account link
          await prisma.account.create({
            data: {
              userId: newUser.id,
              type: account.type,
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              access_token: account.access_token ?? null,
              expires_at: account.expires_at ?? null,
              token_type: account.token_type ?? null,
              scope: account.scope ?? null,
              id_token: account.id_token ?? null,
            },
          });
        } else {
          userId = existingUser.id;
          
          // Check if account link exists
          const existingAccount = await prisma.account.findUnique({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            },
          });

          if (!existingAccount) {
            // Link new OAuth account to existing user
            await prisma.account.create({
              data: {
                userId: existingUser.id,
                type: account.type,
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                access_token: account.access_token ?? null,
                expires_at: account.expires_at ?? null,
                token_type: account.token_type ?? null,
                scope: account.scope ?? null,
                id_token: account.id_token ?? null,
              },
            });
          }
        }

        // Ensure profile exists
        await ensureProfileExists(userId);
      }

      return true; // Allow sign-in
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email ?? null;
      }
      // Set required claims for middleware validation
      token.iss = "sbfin";
      token.aud = "sbfin:web";
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Auth.js redirect callback receives:
      // - url: The URL to redirect to (Auth.js processes callbackUrl internally)
      // - baseUrl: The base URL of the application (API server)
      
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
    // Use absolute URLs to web app for error/signin pages
    // Auth.js will redirect to these URLs when errors occur
    signIn: `${process.env.WEB_APP_URL || "http://localhost:5173"}/login`,
    error: `${process.env.WEB_APP_URL || "http://localhost:5173"}/login`,
  },
};
