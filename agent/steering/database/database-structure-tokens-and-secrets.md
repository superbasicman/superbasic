# Database Structure — Tokens, Hashes, and Provider Secrets

This file defines how we handle all token-like values and provider secrets:

- Canonical token shape and storage format
- Which columns store one-way hashes
- How token hashing and verification work
- How provider credentials are encrypted
- Testing and regression expectations
- Session token handling

Use this whenever you touch:

- API keys
- View links / passcodes
- DB-backed sessions and verification tokens
- Provider access tokens (Plaid, webhooks, processor tokens)

---

## 1. Canonical Token Envelope

**Rule 0: Never store plaintext tokens or passcodes.**

All generated tokens follow the same logical envelope:

- Format: `"<token_id>.<token_secret>"`
  - `token_id`:
    - UUID v4.
    - Stored in plaintext columns (e.g. `*_id`, `token_id`) for lookups.
  - `token_secret`:
    - Opaque secret string; **never** stored in plaintext.

- All `*_hash` columns store a structured JSONB envelope, e.g.:

      {
        "algo": "hmac-sha256",
        "key_id": "v1",
        "hash": "<base64>"
      }

  - `algo` — algorithm identifier (currently `"hmac-sha256"`).
  - `key_id` — which server-side key was used; supports key rotation.
  - `hash` — base64-encoded HMAC digest of `token_secret` (with per-token salt).

- Column DDL must use `JSONB` (not `TEXT`) so we can:
  - Query into metadata.
  - Filter by algorithm or key_id during rotations.

- Token generator helpers must also record:
  - `issued_at`
  - Optional salt metadata
  inside the JSON payload when future rotation or debugging requires it.

---

## 2. One-Way Hash Columns

These columns store **hash envelopes**, never plaintext:

- `api_keys.key_hash`
  - Stores HMAC digest of the API key secret, plus metadata.
- `view_links.token_hash`
- `view_links.passcode_hash`
  - Shared format + metadata (algo, key_id, etc.).
- `sessions.session_token_hash` (when sessions are DB-backed).
- `verification_tokens.token_hash`
  - Shared hash envelope for passwordless / verification flows.

If you add a new token-bearing table, it must:

1. Use `<token_id>.<token_secret>` as the logical token.
2. Store `token_id` plaintext, `token_secret` only in a JSONB hash envelope.
3. Include algorithm, key_id, and any rotation metadata in that JSONB.

---

## 3. Token Hashing & Verification

Shared rules for all token-like secrets:

- Representation:
  - Application-level token: `"<token_id>.<token_secret>"`.
  - DB-level:
    - Plaintext `token_id` (UUID).
    - JSONB `*_hash` column containing the HMAC envelope.

- Hashing:

  - `token_secret` is hashed via HMAC-SHA-256 with:
    - A server-side key.
    - Per-token salt (embedded in the JSON metadata if needed).

  - The hash envelope is stored as JSONB, e.g.:

        {
          "algo": "hmac-sha256",
          "key_id": "v1",
          "hash": "<base64-hmac>",
          "issued_at": "...",
          "salt": "..."
        }

- Verification:

  - Application parses the presented token into:
    - `token_id`, `token_secret`.
  - Looks up DB row by `token_id`.
  - Recomputes HMAC using:
    - stored `key_id` and associated server-side key.
    - Any salt/parameters in the JSON.
  - Compares the recomputed digest to `hash` using a **constant-time** comparison:
    - `timingSafeEqual` (or equivalent in the language runtime).
  - Result:
    - Match → token valid (subject to expiry/revocation checks).
    - No match → token invalid.

- Display/handling:

  - Tokens are shown exactly once (on creation).
  - After that:
    - Only `token_id` and its hash envelope remain.
    - Lost tokens cannot be recovered; callers must regenerate new ones.

---

## 4. Encrypted Provider Secrets (Non-Hashed)

**Important distinction:**

- Tokens that must be **verified** only (API keys, view links, sessions, verification tokens) use **one-way hashing**.
- Provider credentials that must be **reused** (for outbound API calls) use **encryption**, not hashing.

Provider credentials include:

- Plaid access tokens
- Plaid processor tokens
- Webhook signing secrets
- Any other third-party credentials required for API calls

Rules:

- Provider credentials must be encrypted at rest using:
  - Application-level KMS helpers (e.g. cloud KMS or envelope encryption).
- Storage options:
  - Encrypted fields inside `connections.config` **or**
  - A dedicated `connection_secrets`-style table.
- They must **never** be:
  - Hashed (we need to decrypt them to call providers).
  - Logged in plaintext.
  - Persisted in plaintext outside the encryption boundary.

For Plaid:

- Access tokens stay decryptable for Plaid API calls.
- Never log token values (even partially).
- Ensure logs and `pg_stat_activity` never contain raw access tokens.

---

## 5. Verification & Regression Tests

Tests must confirm token handling remains safe and non-leaky.

Recommended coverage:

- **Unit tests:**

  - Verify that:
    - Revoked tokens fail verification.
    - Expired tokens fail verification.
    - Constant-time comparison wrappers are used:
      - Ensure normal equality operators are never used on hashed secrets.

- **Integration tests (auth + view link flows):**

  - Exercise:
    - API key creation and verification.
    - View link issuance and consumption.
    - DB-backed session creation and validation.
    - Verification token workflows (magic links, email verification).

  - Assertions:
    - No plaintext token segments appear in:
      - Application logs.
      - `pg_stat_activity` (`query` column).
    - Only hash envelopes and non-identifying metadata are logged (if anything).

- **Rotation tests:**

  - Mint tokens under an *old* `key_id`.
  - Rotate to a *new* key:
    - Stored tokens still verify correctly using old key metadata.
    - Newly created tokens pick up the latest `algo` + `key_id`.
  - Confirm:
    - The JSONB envelope structure supports mixed key versions.
    - No callers rely on hard-coded algorithm/keys.

---

## 6. Session Tokens

Session behavior depends on session mode:

- **JWT sessions:**

  - Prefer avoiding DB lookups entirely.
  - Sessions validated purely via JWT:
    - Signed using server keys.
    - Subject to expiry embedded in the token.
  - No session token storage in the DB.

- **DB-backed sessions:**

  - Use the same token envelope rules:
    - Session token presented to clients is `"<token_id>.<token_secret>"`.
    - DB stores:
      - `token_id` (via `id` or dedicated column).
      - `sessions.session_token_hash` JSONB envelope (HMAC of token_secret).
  - Never store:
    - `sessionToken` plaintext.
    - Any raw secret segments inside the `sessions` row.

  - Additional constraints:
    - `sessions.session_token_hash` is `UNIQUE`.
    - `expires` is indexed for TTL sweeps.

---

## 7. When Adding New Token Types

If you introduce a new token-bearing feature (e.g., invite tokens, export tokens):

1. Use the canonical `"<token_id>.<token_secret>"` format.  
2. Store `token_id` in plaintext; persist only a JSONB `*_hash` envelope for `token_secret`.  
3. Include `algo`, `key_id`, and any salt/issued_at metadata.  
4. Add unit tests verifying:
   - Constant-time comparison.
   - Revocation/expiry behavior.
5. Add integration tests ensuring:
   - No plaintext token segments appear in logs or `pg_stat_activity`.  
6. Update:
   - This file (schema/contract for the new token).
   - `database-structure-constraints-indexes-and-triggers.md` (if you add constraints/indexes).
   - `database-structure-migrations-ops-and-testing.md` (if you add migrations or ops flows).

This keeps token semantics uniform across the system and prevents accidental secrets leakage.
