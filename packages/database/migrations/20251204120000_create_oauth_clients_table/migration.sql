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
