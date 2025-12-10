# OAuth 2.1 MVP (Web Dashboard)

Goal: single OAuth 2.1 path for the web dashboard, matching `docs/auth-migration/end-auth-goal.md`. No legacy Auth.js flows or hybrid login.

## Client configuration
- Client ID: `web-dashboard`
- Redirect URI: `http://localhost:5173/auth/callback`
- Grant types: authorization_code + refresh_token
- Token auth method: none (public client)

## Flow (Authorization Code + PKCE)
1) App generates `code_verifier`, `code_challenge`, `state` and redirects to:
   - `GET /v1/oauth/authorize?client_id=web-dashboard&redirect_uri=http://localhost:5173/auth/callback&response_type=code&code_challenge=<...>&code_challenge_method=S256&state=<...>`
2) Server checks a valid session cookie; if missing/expired → redirects to `/login?returnTo=<authorize url>`.
3) On success, server issues one-time auth code and redirects to the SPA callback with `code` (and `state`).
4) SPA callback validates `state` and posts to `POST /v1/oauth/token` with:
   - `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `code_verifier`.
5) Server validates PKCE + auth code, creates a session, issues:
   - `access_token` (JWT, short-lived, in-memory)
   - `refresh_token` (opaque, HttpOnly cookie)
6) SPA stores the access token in memory and uses it for Bearer auth. Refresh uses the cookie via `/v1/oauth/token` (`grant_type=refresh_token`).

## Error handling
- `authorize`: invalid client/redirect → redirects back with `error=invalid_request`.
- `token`:
  - Bad/expired/reused auth code → `{ error: 'invalid_grant' }`.
  - PKCE mismatch → `{ error: 'invalid_grant' }`.
  - Bad/expired/reused refresh token → `{ error: 'invalid_grant' }`, reuse triggers family/session revocation.
- SPA callback: validates `state`, surfaces `error`/`error_description` query params, fails fast on missing PKCE params.

## Testing checklist
- Seed client: `pnpm db:seed --target test` (or `local`/`prod`).
- Auth code happy path: /login → /authorize → /token returns access+refresh, cookie set.
- Refresh: POST /v1/oauth/token with `grant_type=refresh_token` rotates refresh tokens, issues new access token.
- Negative: PKCE mismatch, reused/expired auth code, revoked session, invalid redirect URI → errors as above.
