/*
  Warnings:

  - The values [partner] on the enum `ClientType` will be removed. If these variants are still used in the database, this will fail.
  - The primary key for the `api_keys` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `profile_id` on the `api_keys` table. All the data in the column will be lost.
  - The `scopes` column on the `api_keys` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `user_id` on the `user_connection_access_cache` table. All the data in the column will be lost.
  - You are about to drop the column `email` on the `user_identities` table. All the data in the column will be lost.
  - You are about to drop the column `email_verified` on the `user_identities` table. All the data in the column will be lost.
  - You are about to drop the column `metadata` on the `user_identities` table. All the data in the column will be lost.
  - You are about to drop the column `provider_user_id` on the `user_identities` table. All the data in the column will be lost.
  - You are about to drop the column `email` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `email_lower` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `image` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `password_hash` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `users` table. All the data in the column will be lost.
  - The `email_verified` column on the `users` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `expires` on the `verification_tokens` table. All the data in the column will be lost.
  - You are about to drop the column `token_hash` on the `verification_tokens` table. All the data in the column will be lost.
  - You are about to drop the column `owner_profile_id` on the `workspaces` table. All the data in the column will be lost.
  - You are about to drop the `accounts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `sessions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tokens` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `workspace_members` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[provider,provider_subject]` on the table `user_identities` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[parimary_email,deleted_at]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[slug]` on the table `workspaces` will be added. If there are existing duplicate values, this will fail.
  - Made the column `expires_at` on table `api_keys` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `updated_at` to the `oauth_clients` table without a default value. This is not possible if the table is not empty.
  - Added the required column `provider_subject` to the `user_identities` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `provider` on the `user_identities` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `parimary_email` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `expires_at` to the `verification_tokens` table without a default value. This is not possible if the table is not empty.
  - Added the required column `hash_envelope` to the `verification_tokens` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `verification_tokens` table without a default value. This is not possible if the table is not empty.
  - Added the required column `slug` to the `workspaces` table without a default value. This is not possible if the table is not empty.
  - Made the column `name` on table `workspaces` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "UserState" AS ENUM ('active', 'disabled', 'locked');

-- CreateEnum
CREATE TYPE "IdentityProvider" AS ENUM ('google', 'github', 'auth0', 'local_password', 'local_magic_link');

-- CreateEnum
CREATE TYPE "WorkspaceType" AS ENUM ('personal', 'shared');

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('owner', 'admin', 'member', 'viewer');

-- CreateEnum
CREATE TYPE "VerificationTokenType" AS ENUM ('email_verification', 'password_reset', 'magic_link', 'invite');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('internal', 'external');

-- CreateEnum
CREATE TYPE "OAuthGrantType" AS ENUM ('authorization_code', 'refresh_token', 'client_credentials', 'device_code');

-- CreateEnum
CREATE TYPE "AuthMethod" AS ENUM ('none', 'client_secret_post', 'client_secret_basic', 'private_key_jwt');

-- AlterEnum
BEGIN;
CREATE TYPE "ClientType_new" AS ENUM ('web', 'mobile', 'cli', 'service', 'other');
ALTER TABLE "public"."sessions" ALTER COLUMN "client_type" DROP DEFAULT;
ALTER TYPE "ClientType" RENAME TO "ClientType_old";
ALTER TYPE "ClientType_new" RENAME TO "ClientType";
DROP TYPE "public"."ClientType_old" CASCADE;
COMMIT;

-- Legacy tables depend on ClientType_old; drop them first to unblock enum changes
DROP TABLE IF EXISTS "public"."sessions" CASCADE;
DROP TABLE IF EXISTS "public"."tokens" CASCADE;
DROP TABLE IF EXISTS "public"."accounts" CASCADE;
DROP TABLE IF EXISTS "public"."workspace_members" CASCADE;
-- DROP TABLE IF EXISTS "public"."workspaces" CASCADE;
-- DROP TABLE IF EXISTS "public"."api_keys" CASCADE;
DROP TABLE IF EXISTS "public"."oauth_authorization_codes" CASCADE;
-- DROP TABLE IF EXISTS "public"."user_identities" CASCADE;

-- Dropped legacy tables above; the recreated tables and indexes are defined in subsequent migrations

-- AlterTable
-- ALTER TABLE "oauth_clients" ADD COLUMN     "allowed_grant_types" "OAuthGrantType"[] DEFAULT ARRAY[]::"OAuthGrantType"[],
-- ADD COLUMN     "allowed_scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
-- ADD COLUMN     "token_endpoint_auth_method" "AuthMethod" NOT NULL DEFAULT 'none',
-- ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "user_connection_access_cache" DROP COLUMN "user_id";

-- AlterTable
ALTER TABLE "user_identities" DROP COLUMN "email",
DROP COLUMN "email_verified",
DROP COLUMN "metadata",
DROP COLUMN "provider_user_id",
ADD COLUMN     "email_at_provider" TEXT,
ADD COLUMN     "email_verified_at_provider" BOOLEAN,
ADD COLUMN     "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "provider_subject" TEXT NOT NULL,
ADD COLUMN     "raw_profile" JSONB,
DROP COLUMN "provider",
ADD COLUMN     "provider" "IdentityProvider" NOT NULL,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "email",
DROP COLUMN "email_lower",
DROP COLUMN "image",
DROP COLUMN "name",
DROP COLUMN "password_hash",
DROP COLUMN "status",
ADD COLUMN     "default_workspace_id" UUID,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "display_name" TEXT,
ADD COLUMN     "last_login_at" TIMESTAMP(3),
ADD COLUMN     "parimary_email" TEXT NOT NULL,
ADD COLUMN     "picture" TEXT,
ADD COLUMN     "user_state" "UserState" NOT NULL DEFAULT 'active',
DROP COLUMN "email_verified",
ADD COLUMN     "email_verified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "verification_tokens" DROP COLUMN "expires",
DROP COLUMN "token_hash",
ADD COLUMN     "consumed_at" TIMESTAMP(3),
ADD COLUMN     "expires_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "hash_envelope" JSONB NOT NULL,
ADD COLUMN     "type" "VerificationTokenType" NOT NULL,
ALTER COLUMN "token_id" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "workspaces" DROP COLUMN "owner_profile_id",
ADD COLUMN     "owner_user_id" UUID,
ADD COLUMN     "slug" TEXT NOT NULL,
ADD COLUMN     "workspace_type" "WorkspaceType" NOT NULL DEFAULT 'personal',
ALTER COLUMN "name" SET NOT NULL;

-- DropTable
-- DROP TABLE "public"."accounts";

-- DropTable
-- DROP TABLE "public"."sessions";

-- DropTable
-- DROP TABLE "public"."tokens";

-- DropTable
-- DROP TABLE "public"."workspace_members";

-- DropEnum
DROP TYPE "public"."SessionKind";

-- DropEnum
DROP TYPE "public"."TokenType";

-- DropEnum
DROP TYPE "public"."UserStatus";

-- CreateTable
CREATE TABLE "user_passwords" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "password_hash" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_passwords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_activity_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "mfa_level" "MfaLevel" NOT NULL DEFAULT 'none',
    "mfa_completed_at" TIMESTAMP(3),
    "client_info" JSONB,
    "ip_address" TEXT,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "hash_envelope" JSONB NOT NULL,
    "last4" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_ip" TEXT,
    "last_used_ip" TEXT,
    "user_agent" TEXT,
    "rotated_from_id" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_identities" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "serviceType" "ServiceType" NOT NULL DEFAULT 'internal',
    "allowed_workspaces" JSONB DEFAULT '[]',
    "client_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "disabled_at" TIMESTAMP(3),

    CONSTRAINT "service_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_secrets" (
    "id" UUID NOT NULL,
    "service_identity_id" UUID NOT NULL,
    "secret_hash" JSONB NOT NULL,
    "last4" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "client_secrets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_events" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "workspace_id" UUID,
    "service_id" UUID,
    "event_type" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_memberships" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "invited_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "workspace_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_passwords_user_id_key" ON "user_passwords"("user_id");

-- CreateIndex
CREATE INDEX "user_passwords_user_id_idx" ON "user_passwords"("user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_revoked_at_idx" ON "auth_sessions"("revoked_at");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_session_id_idx" ON "refresh_tokens"("session_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_revoked_at_idx" ON "refresh_tokens"("revoked_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "service_identities_client_id_key" ON "service_identities"("client_id");

-- CreateIndex
CREATE INDEX "service_identities_serviceType_idx" ON "service_identities"("serviceType");

-- CreateIndex
CREATE INDEX "service_identities_disabled_at_idx" ON "service_identities"("disabled_at");

-- CreateIndex
CREATE INDEX "client_secrets_service_identity_id_idx" ON "client_secrets"("service_identity_id");

-- CreateIndex
CREATE INDEX "client_secrets_revoked_at_idx" ON "client_secrets"("revoked_at");

-- CreateIndex
CREATE INDEX "client_secrets_expires_at_idx" ON "client_secrets"("expires_at");

-- CreateIndex
CREATE INDEX "security_events_user_id_idx" ON "security_events"("user_id");

-- CreateIndex
CREATE INDEX "security_events_workspace_id_idx" ON "security_events"("workspace_id");

-- CreateIndex
CREATE INDEX "security_events_service_id_idx" ON "security_events"("service_id");

-- CreateIndex
CREATE INDEX "security_events_event_type_idx" ON "security_events"("event_type");

-- CreateIndex
CREATE INDEX "security_events_created_at_idx" ON "security_events"("created_at");

-- CreateIndex
CREATE INDEX "workspace_memberships_user_id_idx" ON "workspace_memberships"("user_id");

-- CreateIndex
CREATE INDEX "workspace_memberships_revoked_at_idx" ON "workspace_memberships"("revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_memberships_workspace_id_user_id_revoked_at_key" ON "workspace_memberships"("workspace_id", "user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "api_keys_expires_at_idx" ON "api_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_identities_provider_provider_subject_key" ON "user_identities"("provider", "provider_subject");

-- CreateIndex
CREATE INDEX "users_user_state_idx" ON "users"("user_state");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE INDEX "users_last_login_at_idx" ON "users"("last_login_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_parimary_email_deleted_at_key" ON "users"("parimary_email", "deleted_at");

-- CreateIndex
CREATE INDEX "verification_tokens_expires_at_idx" ON "verification_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "verification_tokens_consumed_at_idx" ON "verification_tokens"("consumed_at");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE INDEX "workspaces_owner_user_id_idx" ON "workspaces"("owner_user_id");

-- CreateIndex
CREATE INDEX "workspaces_workspace_type_idx" ON "workspaces"("workspace_type");

-- CreateIndex
CREATE INDEX "workspaces_deleted_at_idx" ON "workspaces"("deleted_at");

-- AddForeignKey
ALTER TABLE "user_passwords" ADD CONSTRAINT "user_passwords_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auth_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_rotated_from_id_fkey" FOREIGN KEY ("rotated_from_id") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_workspace_id_fkey";
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- ALTER TABLE "service_identities" ADD CONSTRAINT "service_identities_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("client_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_secrets" ADD CONSTRAINT "client_secrets_service_identity_id_fkey" FOREIGN KEY ("service_identity_id") REFERENCES "service_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("client_id") ON DELETE RESTRICT ON UPDATE CASCADE;
