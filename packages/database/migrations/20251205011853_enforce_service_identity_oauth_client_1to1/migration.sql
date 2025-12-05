/*
  Warnings:

  - Made the column `client_id` on table `service_identities` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."oauth_authorization_codes" DROP CONSTRAINT "oauth_authorization_codes_client_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."service_identities" DROP CONSTRAINT "service_identities_client_id_fkey";

-- AlterTable
ALTER TABLE "oauth_clients" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "service_identities" ALTER COLUMN "client_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "service_identities" ADD CONSTRAINT "service_identities_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("client_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("client_id") ON DELETE RESTRICT ON UPDATE CASCADE;
