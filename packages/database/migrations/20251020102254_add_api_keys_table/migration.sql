-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileId" TEXT,
    "workspaceId" TEXT,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_userId_name_key" ON "api_keys"("userId", "name");

-- CreateIndex
CREATE INDEX "api_keys_userId_idx" ON "api_keys"("userId");

-- CreateIndex
CREATE INDEX "api_keys_profileId_idx" ON "api_keys"("profileId");

-- CreateIndex
CREATE INDEX "api_keys_workspaceId_idx" ON "api_keys"("workspaceId");

-- CreateIndex
CREATE INDEX "api_keys_keyHash_idx" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_revokedAt_idx" ON "api_keys"("revokedAt");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add CHECK constraint to ensure either profileId OR workspaceId is set (not both, not neither)
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_owner_check" CHECK (
    (("profileId" IS NOT NULL)::int + ("workspaceId" IS NOT NULL)::int) = 1
);
