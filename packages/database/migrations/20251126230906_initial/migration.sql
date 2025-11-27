DO $$
BEGIN
  -- Only adjust oauth_authorization_codes if the table already exists (avoids failures before creation)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'oauth_authorization_codes'
  ) THEN
    ALTER TABLE "public"."oauth_authorization_codes"
      DROP CONSTRAINT IF EXISTS "oauth_authorization_codes_client_id_fkey";

    ALTER TABLE "oauth_authorization_codes"
      ADD CONSTRAINT "oauth_authorization_codes_client_id_fkey"
      FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("client_id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END;
$$;

-- Drop defaults only if the tables already exist (fresh installs create them later)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tokens'
  ) THEN
    ALTER TABLE "tokens" ALTER COLUMN "updated_at" DROP DEFAULT;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_identities'
  ) THEN
    ALTER TABLE "user_identities" ALTER COLUMN "updated_at" DROP DEFAULT;
  END IF;
END;
$$;

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
