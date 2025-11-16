-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "UserStatus" AS ENUM ('active', 'disabled', 'locked');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- AlterTable
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "status" "UserStatus" NOT NULL DEFAULT 'active';
