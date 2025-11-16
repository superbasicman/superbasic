-- Create required enums if they do not yet exist
DO $$
BEGIN
    CREATE TYPE "ClientType" AS ENUM ('web', 'mobile', 'cli', 'partner', 'other');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE "SessionKind" AS ENUM ('default', 'persistent', 'short');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE "MfaLevel" AS ENUM ('none', 'mfa', 'phishing_resistant');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- Align sessions table columns with Prisma schema
ALTER TABLE "sessions"
ADD COLUMN IF NOT EXISTS "absolute_expires_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "client_type" "ClientType" NOT NULL DEFAULT 'web',
ADD COLUMN IF NOT EXISTS "device_name" TEXT,
ADD COLUMN IF NOT EXISTS "ip_address" TEXT,
ADD COLUMN IF NOT EXISTS "kind" "SessionKind" NOT NULL DEFAULT 'default',
ADD COLUMN IF NOT EXISTS "last_used_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "mfa_level" "MfaLevel" NOT NULL DEFAULT 'none',
ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "user_agent" TEXT;
