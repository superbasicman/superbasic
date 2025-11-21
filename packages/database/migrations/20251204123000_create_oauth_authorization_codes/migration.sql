-- Create enum for PKCE code challenge methods if it does not exist
DO $$
BEGIN
    CREATE TYPE "PkceChallengeMethod" AS ENUM ('S256', 'plain');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- Table for short-lived OAuth authorization codes
CREATE TABLE IF NOT EXISTS "oauth_authorization_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "client_id" TEXT NOT NULL,
    "redirect_uri" TEXT NOT NULL,
    "code_hash" JSONB NOT NULL,
    "code_challenge" TEXT NOT NULL,
    "code_challenge_method" "PkceChallengeMethod" NOT NULL DEFAULT 'S256',
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_authorization_codes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "oauth_authorization_codes_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "oauth_authorization_codes_client_id_fkey"
        FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("client_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "oauth_authorization_codes_client_id_idx" ON "oauth_authorization_codes"("client_id");
CREATE INDEX IF NOT EXISTS "oauth_authorization_codes_expires_at_idx" ON "oauth_authorization_codes"("expires_at");
CREATE INDEX IF NOT EXISTS "oauth_authorization_codes_consumed_at_idx" ON "oauth_authorization_codes"("consumed_at");
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_authorization_codes_code_hash_hash_key"
  ON "oauth_authorization_codes"((code_hash ->> 'hash'));
