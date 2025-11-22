# Signing Key Rotation Runbook

## Config surface
- Active signer: `AUTH_JWT_PRIVATE_KEY` or `AUTH_JWT_PRIVATE_KEY_FILE` (PEM or base64). In staging/prod point this at a KMS/secret-manager materialized file (e.g. mounted at `/var/run/secrets/auth_jwt.pem`).
- Active key id: `AUTH_JWT_KEY_ID` (kid placed in JWT headers and JWKS).
- Additional verification keys: `AUTH_JWT_ADDITIONAL_PUBLIC_KEYS` or `_FILE` containing JSON like `[{"kid":"2024-05-01","publicKey":"<PEM or base64>","alg":"EdDSA"}]`. Use this to keep the previous key available during overlap windows.
- Algorithm: `AUTH_JWT_ALGORITHM` (`EdDSA` preferred). JWKS endpoints (`/.well-known/jwks.json`, `/v1/auth/jwks.json`) publish the active signer plus any configured verification keys.

## Normal rotation cadence
- Rotate quarterly (or on staff transitions) and keep an overlap window of at least the max access token TTL + 5 minutes (currently 15m + skew) so cached tokens continue to verify.

### Standard rotation steps
1) Generate a new Ed25519 key in KMS; export/store the private PEM in secret manager and mount it for the API (`AUTH_JWT_PRIVATE_KEY_FILE`), updating `AUTH_JWT_KEY_ID` to the new kid.
2) Add the prior public key to `AUTH_JWT_ADDITIONAL_PUBLIC_KEYS` with its old kid so the API still serves/verifies it during the overlap period; redeploy.
3) Verify `/.well-known/jwks.json` lists both kids (old + new) and that a sample request signed with the old kid still passes `AuthService.verifyRequest`.
4) After the overlap window elapses, remove the old entry from `AUTH_JWT_ADDITIONAL_PUBLIC_KEYS` and redeploy so JWKS publishes only current keys.

### Emergency rotation
- Generate a new key, set `AUTH_JWT_KEY_ID` + `AUTH_JWT_PRIVATE_KEY_FILE`, remove compromised kids from `AUTH_JWT_ADDITIONAL_PUBLIC_KEYS`, and redeploy to stop accepting affected tokens immediately.
- Rotate refresh tokens/sessions if compromise is suspected and monitor auth logs for spikes in signature failures.

## Validation
- Hit `/.well-known/jwks.json` (or `/v1/auth/jwks.json`) to confirm the expected key set before/after overlap.
- Run `pnpm --filter @repo/auth-core exec vitest run src/__tests__/auth-service.test.ts --runInBand` to exercise rotated-key verification locally.
