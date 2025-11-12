-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "email_lower" TEXT NOT NULL,
    "email_verified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "password_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "refresh_token_ciphertext" TEXT,
    "access_token_ciphertext" TEXT,
    "expires_at" TIMESTAMP(3),
    "token_type" TEXT,
    "scope" TEXT,
    "id_token_ciphertext" TEXT,
    "session_state" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_id" UUID NOT NULL,
    "session_token_hash" JSONB NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "token_id" UUID NOT NULL,
    "token_hash" JSONB NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "settings" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "slot_limit" INTEGER,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "workspace_id" UUID,
    "name" TEXT NOT NULL,
    "key_hash" JSONB NOT NULL,
    "last4" TEXT NOT NULL,
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "owner_profile_id" UUID NOT NULL,
    "name" TEXT,
    "settings" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "member_profile_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "scope_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_views" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "view_filters" (
    "id" UUID NOT NULL,
    "view_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "view_filters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "view_sorts" (
    "id" UUID NOT NULL,
    "view_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "view_sorts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "view_group_by" (
    "id" UUID NOT NULL,
    "view_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "view_group_by_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "view_rule_overrides" (
    "id" UUID NOT NULL,
    "view_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "view_rule_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "view_category_groups" (
    "id" UUID NOT NULL,
    "view_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "view_category_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "view_category_overrides" (
    "id" UUID NOT NULL,
    "view_id" UUID NOT NULL,
    "source_category_id" UUID,
    "target_category_id" UUID,
    "workspace_source_category_id" UUID,
    "workspace_target_category_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "view_category_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "view_shares" (
    "id" UUID NOT NULL,
    "view_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "can_edit" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "view_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "view_links" (
    "id" UUID NOT NULL,
    "view_id" UUID NOT NULL,
    "token_id" UUID NOT NULL,
    "token_hash" JSONB NOT NULL,
    "passcode_hash" JSONB,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_by_profile_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "view_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_groups" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT,
    "color" TEXT,
    "sort" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "account_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_group_memberships" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_group_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_connection_links" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "granted_by_profile_id" UUID NOT NULL,
    "account_scope_json" JSONB,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_connection_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_allowed_accounts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "granted_by_profile_id" UUID NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_allowed_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "profile_id" UUID,
    "parent_id" UUID,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_category_overrides" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "source_category_id" UUID NOT NULL,
    "target_category_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "profile_category_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_categories" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "parent_id" UUID,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort" INTEGER,
    "color" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "workspace_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_category_overrides" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "source_category_id" UUID,
    "target_category_id" UUID,
    "system_source_category_id" UUID,
    "system_target_category_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "workspace_category_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connections" (
    "id" UUID NOT NULL,
    "owner_profile_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_item_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "tx_cursor" TEXT,
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connection_sponsor_history" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "from_profile_id" UUID,
    "to_profile_id" UUID NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connection_sponsor_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connection_secrets" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "access_token_ciphertext" TEXT,
    "processor_token_ciphertext" TEXT,
    "webhook_secret_ciphertext" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connection_secrets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "external_account_id" TEXT NOT NULL,
    "institution" TEXT,
    "subtype" TEXT,
    "mask" TEXT,
    "name" TEXT,
    "balance_cents" BIGINT,
    "currency" VARCHAR(3) NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "provider_tx_id" TEXT NOT NULL,
    "posted_at" TIMESTAMP(3) NOT NULL,
    "authorized_at" TIMESTAMP(3),
    "amount_cents" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "system_category_id" UUID,
    "merchant_raw" TEXT,
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_overlays" (
    "id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "category_id" UUID,
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "splits" JSONB NOT NULL DEFAULT '[]',
    "merchant_correction" TEXT,
    "exclude" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "transaction_overlays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_audit_log" (
    "id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "sync_session_id" UUID,
    "event" TEXT NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_plans" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "owner_profile_id" UUID NOT NULL,
    "name" TEXT,
    "currency" VARCHAR(3) NOT NULL,
    "rollup_mode" TEXT NOT NULL,
    "view_id" UUID,
    "view_filter_snapshot" JSONB,
    "view_filter_hash" TEXT,
    "is_template" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "budget_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_versions" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "period" TEXT NOT NULL,
    "carryover_mode" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_envelopes" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "category_id" UUID,
    "label" TEXT NOT NULL,
    "limit_cents" BIGINT NOT NULL,
    "warn_at_pct" INTEGER,
    "group_label" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "budget_envelopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_actuals" (
    "plan_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "envelope_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "period" DATE NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "rollup_mode" TEXT NOT NULL,
    "posted_amount_cents" BIGINT NOT NULL,
    "authorized_amount_cents" BIGINT NOT NULL,
    "workspace_category_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_actuals_pkey" PRIMARY KEY ("plan_id","version_id","envelope_id","period")
);

-- CreateTable
CREATE TABLE "sync_sessions" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "initiator_profile_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "stats" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_page_payloads" (
    "id" UUID NOT NULL,
    "sync_session_id" UUID NOT NULL,
    "page_no" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_page_payloads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_idempotency" (
    "id" UUID NOT NULL,
    "sync_session_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "result_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_idempotency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_leases" (
    "id" UUID NOT NULL,
    "sync_session_id" UUID NOT NULL,
    "leased_until" TIMESTAMP(3) NOT NULL,
    "holder" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_audit_log" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "sync_session_id" UUID,
    "initiator_profile_id" UUID,
    "event" TEXT NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_connection_access_cache" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "workspace_id" UUID,
    "account_scope_json" JSONB,
    "user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_connection_access_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_transaction_access_cache" (
    "id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "workspace_id" UUID,
    "connection_id" UUID,
    "bank_account_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_transaction_access_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_lower_key" ON "users"("email_lower");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE INDEX "sessions_token_id_idx" ON "sessions"("token_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_hash_hash_key" ON "sessions"((session_token_hash ->> 'hash'));

-- CreateIndex
CREATE INDEX "verification_tokens_identifier_idx" ON "verification_tokens"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_hash_hash_key" ON "verification_tokens"((token_hash ->> 'hash'));

-- CreateIndex
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");

-- CreateIndex
CREATE INDEX "subscriptions_profile_id_idx" ON "subscriptions"("profile_id");

-- CreateIndex
CREATE INDEX "api_keys_user_id_idx" ON "api_keys"("user_id");

-- CreateIndex
CREATE INDEX "api_keys_profile_id_idx" ON "api_keys"("profile_id");

-- CreateIndex
CREATE INDEX "api_keys_workspace_id_idx" ON "api_keys"("workspace_id");

-- CreateIndex
CREATE INDEX "api_keys_revoked_at_idx" ON "api_keys"("revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_hash_key" ON "api_keys"((key_hash ->> 'hash'));

-- CreateIndex
CREATE INDEX "workspace_members_workspace_id_idx" ON "workspace_members"("workspace_id");

-- CreateIndex
CREATE INDEX "workspace_members_member_profile_id_idx" ON "workspace_members"("member_profile_id");

-- CreateIndex
CREATE INDEX "view_shares_view_id_idx" ON "view_shares"("view_id");

-- CreateIndex
CREATE INDEX "view_shares_profile_id_idx" ON "view_shares"("profile_id");

-- CreateIndex
CREATE INDEX "view_links_view_id_idx" ON "view_links"("view_id");

-- CreateIndex
CREATE INDEX "view_links_expires_at_idx" ON "view_links"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "view_links_token_id_key" ON "view_links"("token_id");

-- CreateIndex
CREATE UNIQUE INDEX "view_links_token_hash_hash_key" ON "view_links"((token_hash ->> 'hash'));

-- CreateIndex
CREATE UNIQUE INDEX "view_links_passcode_hash_hash_key" ON "view_links"((passcode_hash ->> 'hash')) WHERE passcode_hash IS NOT NULL;

-- CreateIndex
CREATE INDEX "account_group_memberships_group_id_idx" ON "account_group_memberships"("group_id");

-- CreateIndex
CREATE INDEX "account_group_memberships_account_id_idx" ON "account_group_memberships"("account_id");

-- CreateIndex
CREATE INDEX "workspace_connection_links_workspace_id_idx" ON "workspace_connection_links"("workspace_id");

-- CreateIndex
CREATE INDEX "workspace_connection_links_connection_id_idx" ON "workspace_connection_links"("connection_id");

-- CreateIndex
CREATE INDEX "workspace_allowed_accounts_workspace_id_idx" ON "workspace_allowed_accounts"("workspace_id");

-- CreateIndex
CREATE INDEX "workspace_allowed_accounts_bank_account_id_idx" ON "workspace_allowed_accounts"("bank_account_id");

-- CreateIndex
CREATE INDEX "categories_profile_id_idx" ON "categories"("profile_id");

-- CreateIndex
CREATE INDEX "profile_category_overrides_profile_id_idx" ON "profile_category_overrides"("profile_id");

-- CreateIndex
CREATE INDEX "workspace_categories_workspace_id_idx" ON "workspace_categories"("workspace_id");

-- CreateIndex
CREATE INDEX "workspace_category_overrides_workspace_id_idx" ON "workspace_category_overrides"("workspace_id");

-- CreateIndex
CREATE INDEX "connections_owner_profile_id_idx" ON "connections"("owner_profile_id");

-- CreateIndex
CREATE INDEX "connections_provider_provider_item_id_idx" ON "connections"("provider", "provider_item_id");

-- CreateIndex
CREATE INDEX "connection_sponsor_history_connection_id_idx" ON "connection_sponsor_history"("connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "connection_secrets_connection_id_key" ON "connection_secrets"("connection_id");

-- CreateIndex
CREATE INDEX "bank_accounts_connection_id_idx" ON "bank_accounts"("connection_id");

-- CreateIndex
CREATE INDEX "transactions_account_id_idx" ON "transactions"("account_id");

-- CreateIndex
CREATE INDEX "transactions_connection_id_provider_tx_id_idx" ON "transactions"("connection_id", "provider_tx_id");

-- CreateIndex
CREATE INDEX "transactions_posted_at_idx" ON "transactions"("posted_at");

-- CreateIndex
CREATE INDEX "transaction_overlays_profile_id_idx" ON "transaction_overlays"("profile_id");

-- CreateIndex
CREATE INDEX "transaction_overlays_transaction_id_idx" ON "transaction_overlays"("transaction_id");

-- CreateIndex
CREATE INDEX "transaction_audit_log_transaction_id_idx" ON "transaction_audit_log"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_versions_plan_id_version_no_key" ON "budget_versions"("plan_id", "version_no");

-- CreateIndex
CREATE INDEX "budget_actuals_workspace_id_period_idx" ON "budget_actuals"("workspace_id", "period");

-- CreateIndex
CREATE INDEX "sync_sessions_connection_id_idx" ON "sync_sessions"("connection_id");

-- CreateIndex
CREATE INDEX "session_page_payloads_sync_session_id_idx" ON "session_page_payloads"("sync_session_id");

-- CreateIndex
CREATE INDEX "session_page_payloads_expires_at_idx" ON "session_page_payloads"("expires_at");

-- CreateIndex
CREATE INDEX "session_idempotency_sync_session_id_idx" ON "session_idempotency"("sync_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_idempotency_idempotency_key_key" ON "session_idempotency"("idempotency_key");

-- CreateIndex
CREATE INDEX "session_leases_sync_session_id_idx" ON "session_leases"("sync_session_id");

-- CreateIndex
CREATE INDEX "sync_audit_log_connection_id_idx" ON "sync_audit_log"("connection_id");

-- CreateIndex
CREATE INDEX "user_connection_access_cache_profile_id_idx" ON "user_connection_access_cache"("profile_id");

-- CreateIndex
CREATE INDEX "user_connection_access_cache_connection_id_idx" ON "user_connection_access_cache"("connection_id");

-- CreateIndex
CREATE INDEX "profile_transaction_access_cache_transaction_id_idx" ON "profile_transaction_access_cache"("transaction_id");

-- CreateIndex
CREATE INDEX "profile_transaction_access_cache_profile_id_idx" ON "profile_transaction_access_cache"("profile_id");

-- AddConstraints
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_currency_ck" CHECK (char_length(currency) = 3);

-- AddConstraints
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_currency_ck" CHECK (char_length(currency) = 3);

-- AddConstraints
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_currency_ck" CHECK (char_length(currency) = 3);

-- AddConstraints
ALTER TABLE "budget_plans" ADD CONSTRAINT "budget_plans_currency_ck" CHECK (char_length(currency) = 3);

-- AddConstraints
ALTER TABLE "budget_actuals" ADD CONSTRAINT "budget_actuals_currency_ck" CHECK (char_length(currency) = 3);

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_member_profile_id_fkey" FOREIGN KEY ("member_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "view_filters" ADD CONSTRAINT "view_filters_view_id_fkey" FOREIGN KEY ("view_id") REFERENCES "saved_views"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "view_sorts" ADD CONSTRAINT "view_sorts_view_id_fkey" FOREIGN KEY ("view_id") REFERENCES "saved_views"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "view_group_by" ADD CONSTRAINT "view_group_by_view_id_fkey" FOREIGN KEY ("view_id") REFERENCES "saved_views"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "view_rule_overrides" ADD CONSTRAINT "view_rule_overrides_view_id_fkey" FOREIGN KEY ("view_id") REFERENCES "saved_views"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "view_category_groups" ADD CONSTRAINT "view_category_groups_view_id_fkey" FOREIGN KEY ("view_id") REFERENCES "saved_views"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "view_category_overrides" ADD CONSTRAINT "view_category_overrides_view_id_fkey" FOREIGN KEY ("view_id") REFERENCES "saved_views"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "view_category_overrides" ADD CONSTRAINT "view_category_overrides_source_category_id_fkey" FOREIGN KEY ("source_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "view_category_overrides" ADD CONSTRAINT "view_category_overrides_target_category_id_fkey" FOREIGN KEY ("target_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "view_category_overrides" ADD CONSTRAINT "view_category_overrides_workspace_source_category_id_fkey" FOREIGN KEY ("workspace_source_category_id") REFERENCES "workspace_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "view_category_overrides" ADD CONSTRAINT "view_category_overrides_workspace_target_category_id_fkey" FOREIGN KEY ("workspace_target_category_id") REFERENCES "workspace_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "view_shares" ADD CONSTRAINT "view_shares_view_id_fkey" FOREIGN KEY ("view_id") REFERENCES "saved_views"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "view_shares" ADD CONSTRAINT "view_shares_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "view_links" ADD CONSTRAINT "view_links_view_id_fkey" FOREIGN KEY ("view_id") REFERENCES "saved_views"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "view_links" ADD CONSTRAINT "view_links_created_by_profile_id_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_groups" ADD CONSTRAINT "account_groups_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_group_memberships" ADD CONSTRAINT "account_group_memberships_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "account_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_group_memberships" ADD CONSTRAINT "account_group_memberships_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_connection_links" ADD CONSTRAINT "workspace_connection_links_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_connection_links" ADD CONSTRAINT "workspace_connection_links_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_connection_links" ADD CONSTRAINT "workspace_connection_links_granted_by_profile_id_fkey" FOREIGN KEY ("granted_by_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_allowed_accounts" ADD CONSTRAINT "workspace_allowed_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_allowed_accounts" ADD CONSTRAINT "workspace_allowed_accounts_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_allowed_accounts" ADD CONSTRAINT "workspace_allowed_accounts_granted_by_profile_id_fkey" FOREIGN KEY ("granted_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_category_overrides" ADD CONSTRAINT "profile_category_overrides_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_category_overrides" ADD CONSTRAINT "profile_category_overrides_source_category_id_fkey" FOREIGN KEY ("source_category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_category_overrides" ADD CONSTRAINT "profile_category_overrides_target_category_id_fkey" FOREIGN KEY ("target_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_categories" ADD CONSTRAINT "workspace_categories_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_categories" ADD CONSTRAINT "workspace_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "workspace_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_category_overrides" ADD CONSTRAINT "workspace_category_overrides_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_category_overrides" ADD CONSTRAINT "workspace_category_overrides_source_category_id_fkey" FOREIGN KEY ("source_category_id") REFERENCES "workspace_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_category_overrides" ADD CONSTRAINT "workspace_category_overrides_target_category_id_fkey" FOREIGN KEY ("target_category_id") REFERENCES "workspace_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_category_overrides" ADD CONSTRAINT "workspace_category_overrides_system_source_category_id_fkey" FOREIGN KEY ("system_source_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_category_overrides" ADD CONSTRAINT "workspace_category_overrides_system_target_category_id_fkey" FOREIGN KEY ("system_target_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_owner_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_sponsor_history" ADD CONSTRAINT "connection_sponsor_history_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_sponsor_history" ADD CONSTRAINT "connection_sponsor_history_from_profile_id_fkey" FOREIGN KEY ("from_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_sponsor_history" ADD CONSTRAINT "connection_sponsor_history_to_profile_id_fkey" FOREIGN KEY ("to_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_secrets" ADD CONSTRAINT "connection_secrets_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_system_category_id_fkey" FOREIGN KEY ("system_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_overlays" ADD CONSTRAINT "transaction_overlays_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_overlays" ADD CONSTRAINT "transaction_overlays_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_overlays" ADD CONSTRAINT "transaction_overlays_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_audit_log" ADD CONSTRAINT "transaction_audit_log_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_audit_log" ADD CONSTRAINT "transaction_audit_log_sync_session_id_fkey" FOREIGN KEY ("sync_session_id") REFERENCES "sync_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_plans" ADD CONSTRAINT "budget_plans_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_plans" ADD CONSTRAINT "budget_plans_owner_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_plans" ADD CONSTRAINT "budget_plans_view_id_fkey" FOREIGN KEY ("view_id") REFERENCES "saved_views"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_versions" ADD CONSTRAINT "budget_versions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "budget_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_envelopes" ADD CONSTRAINT "budget_envelopes_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "budget_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_envelopes" ADD CONSTRAINT "budget_envelopes_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_actuals" ADD CONSTRAINT "budget_actuals_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "budget_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_actuals" ADD CONSTRAINT "budget_actuals_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "budget_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_actuals" ADD CONSTRAINT "budget_actuals_envelope_id_fkey" FOREIGN KEY ("envelope_id") REFERENCES "budget_envelopes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_actuals" ADD CONSTRAINT "budget_actuals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_actuals" ADD CONSTRAINT "budget_actuals_workspace_category_id_fkey" FOREIGN KEY ("workspace_category_id") REFERENCES "workspace_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_sessions" ADD CONSTRAINT "sync_sessions_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_sessions" ADD CONSTRAINT "sync_sessions_initiator_profile_id_fkey" FOREIGN KEY ("initiator_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_page_payloads" ADD CONSTRAINT "session_page_payloads_sync_session_id_fkey" FOREIGN KEY ("sync_session_id") REFERENCES "sync_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_idempotency" ADD CONSTRAINT "session_idempotency_sync_session_id_fkey" FOREIGN KEY ("sync_session_id") REFERENCES "sync_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_leases" ADD CONSTRAINT "session_leases_sync_session_id_fkey" FOREIGN KEY ("sync_session_id") REFERENCES "sync_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_audit_log" ADD CONSTRAINT "sync_audit_log_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_audit_log" ADD CONSTRAINT "sync_audit_log_sync_session_id_fkey" FOREIGN KEY ("sync_session_id") REFERENCES "sync_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_audit_log" ADD CONSTRAINT "sync_audit_log_initiator_profile_id_fkey" FOREIGN KEY ("initiator_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_connection_access_cache" ADD CONSTRAINT "user_connection_access_cache_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_connection_access_cache" ADD CONSTRAINT "user_connection_access_cache_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_connection_access_cache" ADD CONSTRAINT "user_connection_access_cache_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_transaction_access_cache" ADD CONSTRAINT "profile_transaction_access_cache_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_transaction_access_cache" ADD CONSTRAINT "profile_transaction_access_cache_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_transaction_access_cache" ADD CONSTRAINT "profile_transaction_access_cache_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_transaction_access_cache" ADD CONSTRAINT "profile_transaction_access_cache_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_transaction_access_cache" ADD CONSTRAINT "profile_transaction_access_cache_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
