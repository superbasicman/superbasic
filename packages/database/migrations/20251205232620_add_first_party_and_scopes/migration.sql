-- AlterTable
ALTER TABLE "oauth_clients" ADD COLUMN     "is_first_party" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[];
