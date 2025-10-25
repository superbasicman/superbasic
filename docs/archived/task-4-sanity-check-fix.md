# Task 4 Sanity Check Fix

**Date**: 2025-10-25  
**Issue**: Manual curl commands failing with "MissingCSRF" error  
**Resolution**: Created automated test scripts with proper CSRF token handling

## Problem

User attempted to run Task 4 sanity checks manually using curl commands from `.kiro/specs/authjs-migration/tasks.md` but encountered:

1. **Shell parsing error**: Command got mangled with duplicate prompt text
2. **MissingCSRF error**: CSRF token wasn't properly extracted or sent to the sign-in endpoint

```bash
# Original failing command
CSRF_TOKEN=$(curl -s -c /tmp/cookies.txt http://localhost:3000/v1/auth/csrf | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4)
curl -i -X POST http://localhost:3000/v1/auth/callback/credentials \
  -b /tmp/cookies.txt \
  -c /tmp/cookies.txt \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=superbasicman@gmail.com&password=password123.&csrfToken=$CSRF_TOKEN"

# Result: HTTP/1.1 302 Found
# location: http://localhost:3000/login?error=MissingCSRF
```

## Root Cause

The manual curl commands were error-prone due to:
- Complex shell variable extraction with grep/cut
- Cookie file management across multiple commands
- No validation of CSRF token extraction
- Easy to make copy-paste errors

## Solution

Created automated test scripts that handle all the complexity:

### 1. Complete Sanity Check Suite

**File**: `tooling/scripts/task-4-sanity-checks.sh`

Runs all 7 sanity checks from Task 4:
1. ✅ CSRF endpoint returns token
2. ✅ Providers endpoint includes credentials
3. ✅ Sign-in with valid credentials
4. ✅ Session endpoint returns user data
5. ✅ Sign-out clears session
6. ✅ Session endpoint returns null after sign-out
7. ✅ Sign-in with invalid credentials fails

### 2. Individual Test Scripts

- `tooling/scripts/test-credentials-signin.sh` - Test sign-in flow
- `tooling/scripts/test-session-endpoint.sh` - Test session endpoint
- `tooling/scripts/test-signout.sh` - Test sign-out flow

### 3. Documentation

**File**: `tooling/scripts/README-authjs-tests.md`

Complete documentation for running the test scripts.

## Usage

```bash
# Run complete sanity check suite
./tooling/scripts/task-4-sanity-checks.sh

# Or run individual tests
./tooling/scripts/test-credentials-signin.sh
./tooling/scripts/test-session-endpoint.sh
./tooling/scripts/test-signout.sh
```

## Test Results

All 7 sanity checks passing:

```
🎉 All Task 4 Sanity Checks Passed!
====================================

Summary:
  ✅ CSRF endpoint working
  ✅ Credentials provider configured
  ✅ Valid credentials sign-in working
  ✅ Session endpoint working
  ✅ Sign-out working
  ✅ Session cleared after sign-out
  ✅ Invalid credentials rejected
```

## Key Improvements

1. **Automated CSRF token extraction** with validation
2. **Cookie file management** handled automatically
3. **Clear error messages** when checks fail
4. **Idempotent** - can run multiple times safely
5. **Self-documenting** - shows what's being tested at each step

## Lessons Learned

- Manual curl commands are error-prone for complex auth flows
- CSRF token handling requires careful shell scripting
- Automated test scripts are more reliable and easier to maintain
- Always validate intermediate values (like CSRF tokens) before using them

## Related Files

- `.kiro/specs/authjs-migration/tasks.md` - Task 4 specification
- `tooling/scripts/task-4-sanity-checks.sh` - Complete test suite
- `tooling/scripts/README-authjs-tests.md` - Test documentation
