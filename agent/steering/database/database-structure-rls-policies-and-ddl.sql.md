# Database Structure — RLS Policies and DDL (SQL Reference)

This file is the canonical SQL reference for:

- All `CREATE POLICY` statements (RLS)
- RLS `WITH CHECK` clauses
- `ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY` statements

Comments and high-level semantics are documented in:

- `database-structure-rls-and-access-control.md`

This file is meant as a copy-pastable reference for migrations and schema verification.

---

## 1. RLS Policies (CREATE POLICY)

    CREATE POLICY connections_rw ON connections
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND deleted_at IS NULL
        AND (
          owner_profile_id = current_setting('app.profile_id', true)::uuid
          OR (
            current_setting('app.workspace_id', true) IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM workspace_members wm
              WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
            )
            AND EXISTS (
              SELECT 1
              FROM bank_accounts ba
              WHERE ba.connection_id = connections.id
                AND ba.deleted_at IS NULL
                AND (
                  EXISTS (
                    SELECT 1
                    FROM workspace_allowed_accounts waa
                    WHERE waa.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND waa.bank_account_id = ba.id
                      AND waa.revoked_at IS NULL
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM workspace_connection_links wcl
                    WHERE wcl.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND wcl.revoked_at IS NULL
                      AND (wcl.expires_at IS NULL OR wcl.expires_at > now())
                      AND (
                        wcl.account_scope_json IS NULL
                        OR ba.id::text IN (
                          SELECT jsonb_array_elements_text(wcl.account_scope_json)
                        )
                      )
                  )
                )
            )
          )
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND deleted_at IS NULL
        AND owner_profile_id = current_setting('app.profile_id', true)::uuid
      );

    CREATE POLICY workspace_members_rw ON workspace_members
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND (
          member_profile_id = current_setting('app.profile_id', true)::uuid
          OR EXISTS (
            SELECT 1
            FROM workspace_members wm_admin
            WHERE wm_admin.workspace_id = workspace_members.workspace_id
              AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
              AND wm_admin.role IN ('owner', 'admin')
          )
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm_admin
          WHERE wm_admin.workspace_id = workspace_members.workspace_id
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin')
        )
      );

    CREATE POLICY workspace_connection_links_access ON workspace_connection_links
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND current_setting('app.workspace_id', true) IS NOT NULL
        AND workspace_id = current_setting('app.workspace_id', true)::uuid
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > now())
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm
          WHERE wm.workspace_id = workspace_connection_links.workspace_id
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND current_setting('app.workspace_id', true) IS NOT NULL
        AND workspace_id = current_setting('app.workspace_id', true)::uuid
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > now())
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm_admin
          WHERE wm_admin.workspace_id = workspace_connection_links.workspace_id
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin')
        )
      );

    CREATE POLICY workspace_allowed_accounts_access ON workspace_allowed_accounts
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND current_setting('app.workspace_id', true) IS NOT NULL
        AND workspace_id = current_setting('app.workspace_id', true)::uuid
        AND revoked_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm
          WHERE wm.workspace_id = workspace_allowed_accounts.workspace_id
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND current_setting('app.workspace_id', true) IS NOT NULL
        AND workspace_id = current_setting('app.workspace_id', true)::uuid
        AND revoked_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm_admin
          WHERE wm_admin.workspace_id = workspace_allowed_accounts.workspace_id
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin')
        )
      );

    CREATE POLICY bank_accounts_rw ON bank_accounts
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM connections c
          WHERE c.id = bank_accounts.connection_id
            AND c.deleted_at IS NULL
            AND (
              c.owner_profile_id = current_setting('app.profile_id', true)::uuid
              OR (
                current_setting('app.workspace_id', true) IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM workspace_members wm
                  WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                    AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                )
                AND (
                  EXISTS (
                    SELECT 1
                    FROM workspace_allowed_accounts waa
                    WHERE waa.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND waa.bank_account_id = bank_accounts.id
                      AND waa.revoked_at IS NULL
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM workspace_connection_links wcl
                    WHERE wcl.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND wcl.revoked_at IS NULL
                      AND (wcl.expires_at IS NULL OR wcl.expires_at > now())
                      AND (
                        wcl.account_scope_json IS NULL
                        OR bank_accounts.id::text IN (
                          SELECT jsonb_array_elements_text(wcl.account_scope_json)
                        )
                      )
                  )
                )
              )
            )
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM connections c
          WHERE c.id = bank_accounts.connection_id
            AND c.owner_profile_id = current_setting('app.profile_id', true)::uuid
            AND c.deleted_at IS NULL
        )
      );

    CREATE POLICY transactions_owner_insert ON transactions
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM connections c
          WHERE c.id = transactions.connection_id
            AND current_setting('app.profile_id', true) IS NOT NULL
            AND c.deleted_at IS NULL
            AND c.owner_profile_id = current_setting('app.profile_id', true)::uuid
        )
      );

    CREATE POLICY transactions_access ON transactions
      FOR SELECT
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND (
          EXISTS (
            SELECT 1
            FROM connections c
            JOIN bank_accounts ba ON ba.id = transactions.account_id
            WHERE c.id = transactions.connection_id
              AND c.owner_profile_id = current_setting('app.profile_id', true)::uuid
          )
          OR (
            current_setting('app.workspace_id', true) IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM workspace_members wm
              WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
            )
            AND (
              EXISTS (
                SELECT 1
                FROM workspace_allowed_accounts waa
                WHERE waa.workspace_id = current_setting('app.workspace_id', true)::uuid
                  AND waa.bank_account_id = transactions.account_id
                  AND waa.revoked_at IS NULL
              )
              OR EXISTS (
                SELECT 1
                FROM workspace_connection_links wcl
                WHERE wcl.workspace_id = current_setting('app.workspace_id', true)::uuid
                  AND wcl.revoked_at IS NULL
                  AND (wcl.expires_at IS NULL OR wcl.expires_at > now())
                  AND (
                    wcl.account_scope_json IS NULL
                    OR transactions.account_id::text IN (
                      SELECT jsonb_array_elements_text(wcl.account_scope_json)
                    )
                  )
              )
            )
          )
        )
      );
    -- No UPDATE/DELETE policies are defined; transactions stay append-only for app_user.

    CREATE POLICY transaction_overlays_self ON transaction_overlays
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND deleted_at IS NULL
        AND profile_id = current_setting('app.profile_id', true)::uuid
        AND EXISTS (
          SELECT 1
          FROM transactions t
          JOIN connections c ON c.id = t.connection_id
          JOIN bank_accounts ba ON ba.id = t.account_id
          WHERE t.id = transaction_overlays.transaction_id
            AND (
              c.owner_profile_id = current_setting('app.profile_id', true)::uuid
              OR (
                current_setting('app.workspace_id', true) IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM workspace_members wm
                  WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                    AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                )
                AND (
                  EXISTS (
                    SELECT 1
                    FROM workspace_allowed_accounts waa
                    WHERE waa.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND waa.bank_account_id = t.account_id
                      AND waa.revoked_at IS NULL
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM workspace_connection_links wcl
                    WHERE wcl.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND wcl.revoked_at IS NULL
                      AND (wcl.expires_at IS NULL OR wcl.expires_at > now())
                      AND (
                        wcl.account_scope_json IS NULL
                        OR t.account_id::text IN (
                          SELECT jsonb_array_elements_text(wcl.account_scope_json)
                        )
                      )
                  )
                )
              )
            )
        )
      )
      WITH CHECK (
        profile_id = current_setting('app.profile_id', true)::uuid
        AND EXISTS (
          SELECT 1
          FROM transactions t
          JOIN connections c ON c.id = t.connection_id
          JOIN bank_accounts ba ON ba.id = t.account_id
          WHERE t.id = transaction_overlays.transaction_id
            AND (
              c.owner_profile_id = current_setting('app.profile_id', true)::uuid
              OR (
                current_setting('app.workspace_id', true) IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM workspace_members wm
                  WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                    AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                )
                AND (
                  EXISTS (
                    SELECT 1
                    FROM workspace_allowed_accounts waa
                    WHERE waa.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND waa.bank_account_id = t.account_id
                      AND waa.revoked_at IS NULL
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM workspace_connection_links wcl
                    WHERE wcl.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND wcl.revoked_at IS NULL
                      AND (wcl.expires_at IS NULL OR wcl.expires_at > now())
                      AND (
                        wcl.account_scope_json IS NULL
                        OR t.account_id::text IN (
                          SELECT jsonb_array_elements_text(wcl.account_scope_json)
                        )
                      )
                  )
                )
              )
            )
        )
      );

    CREATE POLICY user_connection_cache_policy ON user_connection_access_cache
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND profile_id = current_setting('app.profile_id', true)::uuid
        AND (
          workspace_id IS NULL
          OR workspace_id = current_setting('app.workspace_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND profile_id = current_setting('app.profile_id', true)::uuid
        AND (
          workspace_id IS NULL
          OR workspace_id = current_setting('app.workspace_id', true)::uuid
        )
      );

    CREATE POLICY profile_transaction_cache_policy ON profile_transaction_access_cache
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND profile_id = current_setting('app.profile_id', true)::uuid
        AND (
          workspace_id IS NULL
          OR workspace_id = current_setting('app.workspace_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND profile_id = current_setting('app.profile_id', true)::uuid
        AND (
          workspace_id IS NULL
          OR workspace_id = current_setting('app.workspace_id', true)::uuid
        )
      );

    CREATE POLICY profiles_self_rw ON profiles
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND id = current_setting('app.profile_id', true)::uuid
      )
      WITH CHECK (
        id = current_setting('app.profile_id', true)::uuid
      );

    CREATE POLICY workspaces_membership_access ON workspaces
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND (
          owner_profile_id = current_setting('app.profile_id', true)::uuid
          OR EXISTS (
            SELECT 1
            FROM workspace_members wm
            WHERE wm.workspace_id = workspaces.id
              AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
          )
        )
        AND workspaces.deleted_at IS NULL
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND owner_profile_id = current_setting('app.profile_id', true)::uuid
        AND workspaces.deleted_at IS NULL
      );

    CREATE POLICY categories_profile_scope ON categories
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND (
          profile_id IS NULL
          OR profile_id = current_setting('app.profile_id', true)::uuid
        )
        AND deleted_at IS NULL
      )
      WITH CHECK (
        profile_id = current_setting('app.profile_id', true)::uuid
        AND deleted_at IS NULL
      );

    CREATE POLICY profile_category_overrides_self ON profile_category_overrides
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND profile_id = current_setting('app.profile_id', true)::uuid
      )
      WITH CHECK (
        profile_id = current_setting('app.profile_id', true)::uuid
      );

    CREATE POLICY workspace_categories_membership ON workspace_categories
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND current_setting('app.workspace_id', true) IS NOT NULL
        AND workspace_id = current_setting('app.workspace_id', true)::uuid
        AND deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm
          WHERE wm.workspace_id = workspace_categories.workspace_id
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND current_setting('app.workspace_id', true) IS NOT NULL
        AND workspace_id = current_setting('app.workspace_id', true)::uuid
        AND deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm_admin
          WHERE wm_admin.workspace_id = workspace_categories.workspace_id
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin')
        )
      );

    CREATE POLICY workspace_category_overrides_membership ON workspace_category_overrides
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND current_setting('app.workspace_id', true) IS NOT NULL
        AND workspace_id = current_setting('app.workspace_id', true)::uuid
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm
          WHERE wm.workspace_id = workspace_category_overrides.workspace_id
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND current_setting('app.workspace_id', true) IS NOT NULL
        AND workspace_id = current_setting('app.workspace_id', true)::uuid
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm_admin
          WHERE wm_admin.workspace_id = workspace_category_overrides.workspace_id
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin')
        )
      );

    CREATE POLICY view_category_overrides_membership ON view_category_overrides
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND view_category_overrides.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm ON wm.workspace_id = sv.workspace_id
          WHERE sv.id = view_category_overrides.view_id
            AND sv.deleted_at IS NULL
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND view_category_overrides.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm_admin ON wm_admin.workspace_id = sv.workspace_id
          WHERE sv.id = view_category_overrides.view_id
            AND sv.deleted_at IS NULL
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin', 'editor')
        )
      );

    CREATE POLICY saved_views_membership ON saved_views
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm
          WHERE wm.workspace_id = saved_views.workspace_id
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
        AND saved_views.deleted_at IS NULL
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm_admin
          WHERE wm_admin.workspace_id = saved_views.workspace_id
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin', 'editor')
        )
        AND saved_views.deleted_at IS NULL
      );

    CREATE POLICY view_filters_membership ON view_filters
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm ON wm.workspace_id = sv.workspace_id
          WHERE sv.id = view_filters.view_id
            AND sv.deleted_at IS NULL
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm_admin ON wm_admin.workspace_id = sv.workspace_id
          WHERE sv.id = view_filters.view_id
            AND sv.deleted_at IS NULL
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin', 'editor')
        )
      );

    CREATE POLICY view_sorts_membership ON view_sorts
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm ON wm.workspace_id = sv.workspace_id
          WHERE sv.id = view_sorts.view_id
            AND sv.deleted_at IS NULL
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm_admin ON wm_admin.workspace_id = sv.workspace_id
          WHERE sv.id = view_sorts.view_id
            AND sv.deleted_at IS NULL
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin', 'editor')
        )
      );

    CREATE POLICY view_group_by_membership ON view_group_by
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm ON wm.workspace_id = sv.workspace_id
          WHERE sv.id = view_group_by.view_id
            AND sv.deleted_at IS NULL
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm_admin ON wm_admin.workspace_id = sv.workspace_id
          WHERE sv.id = view_group_by.view_id
            AND sv.deleted_at IS NULL
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin', 'editor')
        )
      );

    CREATE POLICY view_rule_overrides_membership ON view_rule_overrides
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm ON wm.workspace_id = sv.workspace_id
          WHERE sv.id = view_rule_overrides.view_id
            AND sv.deleted_at IS NULL
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm_admin ON wm_admin.workspace_id = sv.workspace_id
          WHERE sv.id = view_rule_overrides.view_id
            AND sv.deleted_at IS NULL
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin', 'editor')
        )
      );

    CREATE POLICY view_category_groups_membership ON view_category_groups
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm ON wm.workspace_id = sv.workspace_id
          WHERE sv.id = view_category_groups.view_id
            AND sv.deleted_at IS NULL
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm_admin ON wm_admin.workspace_id = sv.workspace_id
          WHERE sv.id = view_category_groups.view_id
            AND sv.deleted_at IS NULL
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin', 'editor')
        )
      );

    CREATE POLICY view_shares_membership ON view_shares
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm ON wm.workspace_id = sv.workspace_id
          WHERE sv.id = view_shares.view_id
            AND sv.deleted_at IS NULL
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm_admin ON wm_admin.workspace_id = sv.workspace_id
          WHERE sv.id = view_shares.view_id
            AND sv.deleted_at IS NULL
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin', 'editor')
        )
      );

    CREATE POLICY view_links_membership ON view_links
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm ON wm.workspace_id = sv.workspace_id
          WHERE sv.id = view_links.view_id
            AND sv.deleted_at IS NULL
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM saved_views sv
          JOIN workspace_members wm_admin ON wm_admin.workspace_id = sv.workspace_id
          WHERE sv.id = view_links.view_id
            AND sv.deleted_at IS NULL
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin')
        )
      );

    CREATE POLICY transaction_audit_log_access ON transaction_audit_log
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM transactions t
          JOIN connections c ON c.id = t.connection_id
          JOIN bank_accounts ba ON ba.id = t.account_id
          WHERE t.id = transaction_audit_log.transaction_id
            AND (
              c.owner_profile_id = current_setting('app.profile_id', true)::uuid
              OR (
                current_setting('app.workspace_id', true) IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM workspace_members wm
                  WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                    AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                )
                AND (
                  EXISTS (
                    SELECT 1
                    FROM workspace_allowed_accounts waa
                    WHERE waa.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND waa.bank_account_id = ba.id
                      AND waa.revoked_at IS NULL
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM workspace_connection_links wcl
                    WHERE wcl.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND wcl.revoked_at IS NULL
                      AND (wcl.expires_at IS NULL OR wcl.expires_at > now())
                      AND (
                        wcl.account_scope_json IS NULL
                        OR ba.id::text IN (
                          SELECT jsonb_array_elements_text(wcl.account_scope_json)
                        )
                      )
                  )
                )
              )
            )
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM transactions t
          JOIN connections c ON c.id = t.connection_id
          JOIN bank_accounts ba ON ba.id = t.account_id
          WHERE t.id = transaction_audit_log.transaction_id
            AND (
              c.owner_profile_id = current_setting('app.profile_id', true)::uuid
              OR (
                current_setting('app.workspace_id', true) IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM workspace_members wm
                  WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                    AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                )
                AND (
                  EXISTS (
                    SELECT 1
                    FROM workspace_allowed_accounts waa
                    WHERE waa.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND waa.bank_account_id = ba.id
                      AND waa.revoked_at IS NULL
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM workspace_connection_links wcl
                    WHERE wcl.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND wcl.revoked_at IS NULL
                      AND (wcl.expires_at IS NULL OR wcl.expires_at > now())
                      AND (
                        wcl.account_scope_json IS NULL
                        OR ba.id::text IN (
                          SELECT jsonb_array_elements_text(wcl.account_scope_json)
                        )
                      )
                  )
                )
              )
            )
        )
      );

    CREATE POLICY sync_sessions_access ON sync_sessions
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM connections c
          WHERE c.id = sync_sessions.connection_id
            AND c.deleted_at IS NULL
            AND (
              c.owner_profile_id = current_setting('app.profile_id', true)::uuid
              OR (
                current_setting('app.workspace_id', true) IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM workspace_members wm
                  WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                    AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                )
              )
            )
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM connections c
          WHERE c.id = sync_sessions.connection_id
            AND c.deleted_at IS NULL
            AND (
              c.owner_profile_id = current_setting('app.profile_id', true)::uuid
              OR (
                current_setting('app.workspace_id', true) IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM workspace_members wm
                  WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                    AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                )
              )
            )
        )
      );

    CREATE POLICY session_page_payloads_access ON session_page_payloads
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM sync_sessions ss
          JOIN connections c ON c.id = ss.connection_id
          WHERE ss.id = session_page_payloads.sync_session_id
            AND c.deleted_at IS NULL
            AND (
              c.owner_profile_id = current_setting('app.profile_id', true)::uuid
              OR (
                current_setting('app.workspace_id', true) IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM workspace_members wm
                  WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                    AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                )
              )
            )
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM sync_sessions ss
          JOIN connections c ON c.id = ss.connection_id
          WHERE ss.id = session_page_payloads.sync_session_id
            AND c.deleted_at IS NULL
            AND (
              c.owner_profile_id = current_setting('app.profile_id', true)::uuid
              OR (
                current_setting('app.workspace_id', true) IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM workspace_members wm
                  WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                    AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                )
              )
            )
        )
      );

    CREATE POLICY session_idempotency_access ON session_idempotency
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM sync_sessions ss
          JOIN connections c ON c.id = ss.connection_id
          WHERE ss.id = session_idempotency.sync_session_id
            AND c.deleted_at IS NULL
            AND (
              c.owner_profile_id = current_setting('app.profile_id', true)::uuid
              OR (
                current_setting('app.workspace_id', true) IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM workspace_members wm
                  WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                    AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                )
              )
            )
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM sync_sessions ss
          JOIN connections c ON c.id = ss.connection_id
          WHERE ss.id = session_idempotency.sync_session_id
            AND c.deleted_at IS NULL
            AND (
              c.owner_profile_id = current_setting('app.profile_id', true)::uuid
              OR (
                current_setting('app.workspace_id', true) IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM workspace_members wm
                  WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                    AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                )
              )
            )
        )
      );

    CREATE POLICY session_leases_access ON session_leases
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM sync_sessions ss
          JOIN connections c ON c.id = ss.connection_id
          WHERE ss.id = session_leases.sync_session_id
            AND c.deleted_at IS NULL
            AND (
              c.owner_profile_id = current_setting('app.profile_id', true)::uuid
              OR (
                current_setting('app.workspace_id', true) IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM workspace_members wm
                  WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                    AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                )
              )
            )
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM sync_sessions ss
          JOIN connections c ON c.id = ss.connection_id
          WHERE ss.id = session_leases.sync_session_id
            AND c.deleted_at IS NULL
            AND (
              c.owner_profile_id = current_setting('app.profile_id', true)::uuid
              OR (
                current_setting('app.workspace_id', true) IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM workspace_members wm
                  WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                    AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                )
              )
            )
        )
      );

    CREATE POLICY sync_audit_log_access ON sync_audit_log
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND (
          initiator_profile_id = current_setting('app.profile_id', true)::uuid
          OR EXISTS (
            SELECT 1
            FROM connections c
            WHERE c.id = sync_audit_log.connection_id
              AND c.deleted_at IS NULL
              AND (
                c.owner_profile_id = current_setting('app.profile_id', true)::uuid
                OR (
                  current_setting('app.workspace_id', true) IS NOT NULL
                  AND EXISTS (
                    SELECT 1
                    FROM workspace_members wm
                    WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                  )
                )
              )
          )
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND (
          initiator_profile_id = current_setting('app.profile_id', true)::uuid
          OR EXISTS (
            SELECT 1
            FROM connections c
            WHERE c.id = sync_audit_log.connection_id
              AND c.deleted_at IS NULL
              AND (
                c.owner_profile_id = current_setting('app.profile_id', true)::uuid
                OR (
                  current_setting('app.workspace_id', true) IS NOT NULL
                  AND EXISTS (
                    SELECT 1
                    FROM workspace_members wm
                    WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
                      AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
                  )
                )
              )
          )
        )
      );

    CREATE POLICY api_keys_self ON api_keys
      USING (
        current_setting('app.user_id', true) IS NOT NULL
        AND user_id = current_setting('app.user_id', true)::uuid
      )
      WITH CHECK (
        user_id = current_setting('app.user_id', true)::uuid
      );

    CREATE POLICY subscriptions_owner ON subscriptions
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND profile_id = current_setting('app.profile_id', true)::uuid
      )
      WITH CHECK (
        profile_id = current_setting('app.profile_id', true)::uuid
      );

    CREATE POLICY budget_plans_membership ON budget_plans
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm
          WHERE wm.workspace_id = budget_plans.workspace_id
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
        )
        AND budget_plans.deleted_at IS NULL
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm_admin
          WHERE wm_admin.workspace_id = budget_plans.workspace_id
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin')
        )
        AND budget_plans.deleted_at IS NULL
      );

    CREATE POLICY budget_versions_membership ON budget_versions
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM budget_plans bp
          JOIN workspace_members wm ON wm.workspace_id = bp.workspace_id
          WHERE bp.id = budget_versions.plan_id
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND bp.deleted_at IS NULL
        )
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM budget_plans bp
          JOIN workspace_members wm_admin ON wm_admin.workspace_id = bp.workspace_id
          WHERE bp.id = budget_versions.plan_id
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin')
            AND bp.deleted_at IS NULL
        )
      );

    CREATE POLICY budget_envelopes_membership ON budget_envelopes
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM budget_versions bv
          JOIN budget_plans bp ON bp.id = bv.plan_id
          JOIN workspace_members wm ON wm.workspace_id = bp.workspace_id
          WHERE bv.id = budget_envelopes.version_id
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND bp.deleted_at IS NULL
        )
        AND budget_envelopes.deleted_at IS NULL
      )
      WITH CHECK (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM budget_versions bv
          JOIN budget_plans bp ON bp.id = bv.plan_id
          JOIN workspace_members wm_admin ON wm_admin.workspace_id = bp.workspace_id
          WHERE bv.id = budget_envelopes.version_id
            AND wm_admin.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND wm_admin.role IN ('owner', 'admin')
            AND bp.deleted_at IS NULL
        )
        AND budget_envelopes.deleted_at IS NULL
      );

    CREATE POLICY budget_actuals_membership ON budget_actuals
      USING (
        current_setting('app.profile_id', true) IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM budget_plans bp
          JOIN workspace_members wm ON wm.workspace_id = bp.workspace_id
          WHERE bp.id = budget_actuals.plan_id
            AND wm.member_profile_id = current_setting('app.profile_id', true)::uuid
            AND bp.deleted_at IS NULL
        )
      );

---

## 2. Enable and Force RLS (ALTER TABLE)

These statements ensure RLS is enabled and forced on all user-facing and cache tables.

    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE profiles FORCE ROW LEVEL SECURITY;

    ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
    ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;

    ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
    ALTER TABLE workspace_members FORCE ROW LEVEL SECURITY;

    ALTER TABLE workspace_connection_links ENABLE ROW LEVEL SECURITY;
    ALTER TABLE workspace_connection_links FORCE ROW LEVEL SECURITY;

    ALTER TABLE workspace_allowed_accounts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE workspace_allowed_accounts FORCE ROW LEVEL SECURITY;

    ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
    ALTER TABLE categories FORCE ROW LEVEL SECURITY;

    ALTER TABLE profile_category_overrides ENABLE ROW LEVEL SECURITY;
    ALTER TABLE profile_category_overrides FORCE ROW LEVEL SECURITY;

    ALTER TABLE workspace_categories ENABLE ROW LEVEL SECURITY;
    ALTER TABLE workspace_categories FORCE ROW LEVEL SECURITY;

    ALTER TABLE workspace_category_overrides ENABLE ROW LEVEL SECURITY;
    ALTER TABLE workspace_category_overrides FORCE ROW LEVEL SECURITY;

    ALTER TABLE view_category_overrides ENABLE ROW LEVEL SECURITY;
    ALTER TABLE view_category_overrides FORCE ROW LEVEL SECURITY;

    ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY;
    ALTER TABLE saved_views FORCE ROW LEVEL SECURITY;

    ALTER TABLE view_filters ENABLE ROW LEVEL SECURITY;
    ALTER TABLE view_filters FORCE ROW LEVEL SECURITY;

    ALTER TABLE view_sorts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE view_sorts FORCE ROW LEVEL SECURITY;

    ALTER TABLE view_group_by ENABLE ROW LEVEL SECURITY;
    ALTER TABLE view_group_by FORCE ROW LEVEL SECURITY;

    ALTER TABLE view_rule_overrides ENABLE ROW LEVEL SECURITY;
    ALTER TABLE view_rule_overrides FORCE ROW LEVEL SECURITY;

    ALTER TABLE view_category_groups ENABLE ROW LEVEL SECURITY;
    ALTER TABLE view_category_groups FORCE ROW LEVEL SECURITY;

    ALTER TABLE view_shares ENABLE ROW LEVEL SECURITY;
    ALTER TABLE view_shares FORCE ROW LEVEL SECURITY;

    ALTER TABLE view_links ENABLE ROW LEVEL SECURITY;
    ALTER TABLE view_links FORCE ROW LEVEL SECURITY;

    ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
    ALTER TABLE connections FORCE ROW LEVEL SECURITY;

    ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE bank_accounts FORCE ROW LEVEL SECURITY;

    ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE transactions FORCE ROW LEVEL SECURITY;

    ALTER TABLE transaction_overlays ENABLE ROW LEVEL SECURITY;
    ALTER TABLE transaction_overlays FORCE ROW LEVEL SECURITY;

    ALTER TABLE transaction_audit_log ENABLE ROW LEVEL SECURITY;
    ALTER TABLE transaction_audit_log FORCE ROW LEVEL SECURITY;

    ALTER TABLE sync_sessions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sync_sessions FORCE ROW LEVEL SECURITY;

    ALTER TABLE session_page_payloads ENABLE ROW LEVEL SECURITY;
    ALTER TABLE session_page_payloads FORCE ROW LEVEL SECURITY;

    ALTER TABLE session_idempotency ENABLE ROW LEVEL SECURITY;
    ALTER TABLE session_idempotency FORCE ROW LEVEL SECURITY;

    ALTER TABLE session_leases ENABLE ROW LEVEL SECURITY;
    ALTER TABLE session_leases FORCE ROW LEVEL SECURITY;

    ALTER TABLE sync_audit_log ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sync_audit_log FORCE ROW LEVEL SECURITY;

    ALTER TABLE user_connection_access_cache ENABLE ROW LEVEL SECURITY;
    ALTER TABLE user_connection_access_cache FORCE ROW LEVEL SECURITY;

    ALTER TABLE profile_transaction_access_cache ENABLE ROW LEVEL SECURITY;
    ALTER TABLE profile_transaction_access_cache FORCE ROW LEVEL SECURITY;

    ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
    ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;

    ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;

    ALTER TABLE budget_plans ENABLE ROW LEVEL SECURITY;
    ALTER TABLE budget_plans FORCE ROW LEVEL SECURITY;

    ALTER TABLE budget_versions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE budget_versions FORCE ROW LEVEL SECURITY;

    ALTER TABLE budget_envelopes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE budget_envelopes FORCE ROW LEVEL SECURITY;

    ALTER TABLE budget_actuals ENABLE ROW LEVEL SECURITY;
    ALTER TABLE budget_actuals FORCE ROW LEVEL SECURITY;
