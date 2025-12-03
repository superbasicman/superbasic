-- Helper migration to drop legacy tables/enums that block 20251203073521_
-- Safe when run on a clean schema reset; will no-op if objects are already gone.

DROP TABLE IF EXISTS "public"."sessions" CASCADE;
DROP TABLE IF EXISTS "public"."tokens" CASCADE;
DROP TABLE IF EXISTS "public"."accounts" CASCADE;
DROP TABLE IF EXISTS "public"."workspace_members" CASCADE;
DROP TABLE IF EXISTS "public"."workspaces" CASCADE;
DROP TABLE IF EXISTS "public"."api_keys" CASCADE;
DROP TABLE IF EXISTS "public"."oauth_authorization_codes" CASCADE;
DROP TABLE IF EXISTS "public"."user_identities" CASCADE;

DROP TYPE IF EXISTS "public"."ClientType_old" CASCADE;
