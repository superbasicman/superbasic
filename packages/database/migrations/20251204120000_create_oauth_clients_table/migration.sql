-- Create enum for OAuth client types if it does not exist
DO $$
BEGIN
    CREATE TYPE "OAuthClientType" AS ENUM ('public', 'confidential');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- OAuth clients table for PKCE/native app flows
CREATE TABLE IF NOT EXISTS "oauth_clients" (
    "id" UUID NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_type" "OAuthClientType" NOT NULL,
    "name" TEXT NOT NULL,
    "redirect_uris" TEXT[] NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMP(3),

    CONSTRAINT "oauth_clients_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "oauth_clients_client_id_key" UNIQUE ("client_id"),
    CONSTRAINT "oauth_clients_redirect_uris_not_empty" CHECK (array_length("redirect_uris", 1) > 0)
);

-- Supporting index for filtering on disabled clients
CREATE INDEX IF NOT EXISTS "oauth_clients_disabled_at_idx" ON "oauth_clients"("disabled_at");

-- Ensure enums exist when running in a fresh/shadow database
DO $$
BEGIN
    CREATE TYPE "OAuthGrantType" AS ENUM ('authorization_code', 'refresh_token', 'client_credentials', 'device_code');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE "AuthMethod" AS ENUM ('none', 'client_secret_post', 'client_secret_basic', 'private_key_jwt');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- Added from 20251203073521_ to fix dependency order
ALTER TABLE "oauth_clients" ADD COLUMN     "allowed_grant_types" "OAuthGrantType"[] DEFAULT ARRAY[]::"OAuthGrantType"[],
ADD COLUMN     "allowed_scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "token_endpoint_auth_method" "AuthMethod" NOT NULL DEFAULT 'none',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Fix updated_at default (it was NOT NULL in 20251203 but we need a default for existing rows if any, though table is new here)
-- Actually 20251203 said NOT NULL without default, which implies table was empty or it would fail. Here table is new so it's empty.
-- But wait, we are appending to a file that creates the table. So table is empty.

ALTER TABLE "service_identities" ADD CONSTRAINT "service_identities_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("client_id") ON DELETE SET NULL ON UPDATE CASCADE;
