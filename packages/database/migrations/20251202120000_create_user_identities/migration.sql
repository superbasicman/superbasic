-- Create the user_identities table to track IdP links
CREATE TABLE IF NOT EXISTS "user_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "email" TEXT,
    "email_verified" BOOLEAN,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_identities_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_identities_provider_provider_user_id_key"
    ON "user_identities"("provider", "provider_user_id");

CREATE INDEX IF NOT EXISTS "user_identities_user_id_idx"
    ON "user_identities"("user_id");
