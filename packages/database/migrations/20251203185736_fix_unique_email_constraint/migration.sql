-- Drop the existing unique index that doesn't handle NULL properly
DROP INDEX IF EXISTS "users_parimary_email_deleted_at_key";

-- Create a partial unique index that only applies when deletedAt IS NULL
-- This ensures that active users (not deleted) must have unique emails
-- But allows the same email to be reused after soft-delete
CREATE UNIQUE INDEX "users_active_email_unique" 
  ON "users"("parimary_email") 
  WHERE "deleted_at" IS NULL;
