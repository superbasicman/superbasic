-- CreateTable
CREATE TABLE "session_transfer_tokens" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "hash_envelope" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_ip" TEXT,
    "user_agent" TEXT,
    "client_id" TEXT,

    CONSTRAINT "session_transfer_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_transfer_tokens_session_id_idx" ON "session_transfer_tokens"("session_id");

-- CreateIndex
CREATE INDEX "session_transfer_tokens_expires_at_idx" ON "session_transfer_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "session_transfer_tokens" ADD CONSTRAINT "session_transfer_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auth_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
