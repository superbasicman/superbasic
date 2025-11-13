## Align DB schema & secret handling with steering docs

1. [x] Canonical token envelopes in code  
   Implement helpers that produce the documented JSONB envelope (`algo`, `key_id`, `hash`, `issued_at`, optional `salt`) and update token/session workflows (`@repo/auth`, `@repo/core`, PAT middleware/tests, view links) so we store/compare envelopes instead of raw SHA-256 strings.  
   _AC: API + core tests assert on envelope structure, and no code writes bare hex hashes._

2. [x] Schema constraints & view link columns  
   Add the missing `UNIQUE` indexes for every `*_hash` column, add `token_id` to `view_links`, enforce uniqueness on both token/passcode hashes, and introduce the required `CHECK (char_length(currency)=3)` constraints across money tables. Regenerate the baseline migration to capture the changes.  
   _AC: `pnpm prisma validate` passes, migration diff shows the new columns + constraints, and Prisma client exposes them._

3. [x] Session hashing parity in Auth.js adapter  
   Extend the adapter overrides so session CRUD uses the hashed-envelope column (`session_token_hash`) and remove any leftover plaintext usage.  
   _AC: Creating a session writes JSONB envelope data, and auth tests cover the hashed session flow._

4. [x] Helper triggers & RLS enablement  
   Port the deferrable triggers / helper SQL (profile ownership, workspace membership checks, etc.) plus the RLS enablement + policies described in `database-structure-rls-*.md`.  
   _AC: Baseline migration installs the helper SQL + enables RLS on the tables listed in the steering docs._
