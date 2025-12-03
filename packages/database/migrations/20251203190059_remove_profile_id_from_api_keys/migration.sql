/*
  Warnings:

  - The primary key for the `api_keys` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `profile_id` on the `api_keys` table. All the data in the column will be lost.
  - The `scopes` column on the `api_keys` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[parimary_email,deleted_at]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - Made the column `expires_at` on table `api_keys` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."api_keys" DROP CONSTRAINT IF EXISTS "api_keys_profile_id_fkey";

-- DropIndex
DROP INDEX IF EXISTS "public"."api_keys_profile_id_idx";

-- Drop orphaned trigger and function that reference profile_id
DROP TRIGGER IF EXISTS api_keys_validate_profile_link ON "public"."api_keys";
DROP FUNCTION IF EXISTS api_keys_validate_profile_link_fn();

-- AlterTable
ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_pkey",
DROP COLUMN "profile_id",
ADD COLUMN     "created_by_ip" TEXT,
ADD COLUMN     "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "last_used_ip" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "user_agent" TEXT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "name" DROP NOT NULL,
ALTER COLUMN "last4" DROP NOT NULL,
DROP COLUMN "scopes",
ADD COLUMN     "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "expires_at" SET NOT NULL,
ADD CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_parimary_email_deleted_at_key" ON "users"("parimary_email", "deleted_at");
