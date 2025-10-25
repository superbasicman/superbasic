# Auth.js Sanity Check Scripts

Manual testing scripts for Auth.js integration (Task 4 - Phase 2.1).

## Prerequisites

- API server running on `http://localhost:3000`
- Test user exists: `superbasicman@gmail.com` / `password123.`
- Environment variables loaded from `apps/api/.env.local`

## Scripts

### Complete Sanity Check Suite

```bash
./tooling/scripts/task-4-sanity-checks.sh
```

Runs all 7 sanity checks from Task 4:
1. CSRF endpoint returns token
2. Providers endpoint includes credentials
3. Sign-in with valid credentials
4. Session endpoint returns user data
5. Sign-out clears session
6. Session endpoint returns null after sign-out
7. Sign-in with invalid credentials fails

### Individual Test Scripts

```bash
# Test credentials sign-in flow
./tooling/scripts/test-credentials-signin.sh

# Test session endpoint
./tooling/scripts/test-session-endpoint.sh

# Test sign-out flow
./tooling/scripts/test-signout.sh
```

## Cookie Storage

All scripts use `/tmp/authjs-test-cookies.txt` for cookie storage. This file is automatically created and managed by the scripts.

## Expected Results

All checks should pass with ✅ indicators. If any check fails, the script will exit with a non-zero status code and display the error.

## Troubleshooting

**"No session cookie found"**: Run `test-credentials-signin.sh` first to create a session.

**"User not found"**: The test user doesn't exist. Check the database or create the user manually.

**"CSRF token extraction failed"**: The API server may not be running or the CSRF endpoint is not responding correctly.
