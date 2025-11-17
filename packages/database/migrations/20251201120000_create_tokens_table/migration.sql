-- Create enum for token types (refresh + PATs) if it does not already exist
DO $$
BEGIN
    CREATE TYPE "TokenType" AS ENUM ('refresh', 'personal_access');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- Create unified tokens table for refresh tokens and PATs
CREATE TABLE IF NOT EXISTS "tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_id" UUID,
    "workspace_id" UUID,
    "token_type" "TokenType" NOT NULL,
    "token_hash" JSONB NOT NULL,
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "name" TEXT,
    "family_id" UUID,
    "metadata" JSONB,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tokens_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tokens_session_id_fkey"
        FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "tokens_workspace_id_fkey"
        FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Supporting indexes
CREATE INDEX IF NOT EXISTS "tokens_user_id_idx" ON "tokens"("user_id");
CREATE INDEX IF NOT EXISTS "tokens_session_id_idx" ON "tokens"("session_id");
CREATE INDEX IF NOT EXISTS "tokens_workspace_id_idx" ON "tokens"("workspace_id");
CREATE INDEX IF NOT EXISTS "tokens_family_id_idx" ON "tokens"("family_id");
CREATE INDEX IF NOT EXISTS "tokens_revoked_at_idx" ON "tokens"("revoked_at");

-- Enforce single active refresh token per family
CREATE UNIQUE INDEX IF NOT EXISTS "tokens_active_family_idx"
    ON "tokens"("family_id")
    WHERE "revoked_at" IS NULL AND "family_id" IS NOT NULL;
