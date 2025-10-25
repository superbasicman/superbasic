#!/bin/bash

# Task 4 Sanity Checks - Auth.js Credentials Provider
# Runs all sanity checks from .kiro/specs/authjs-migration/tasks.md Task 4
# Usage: ./tooling/scripts/task-4-sanity-checks.sh

set -e

API_URL="http://localhost:3000"
COOKIES_FILE="/tmp/authjs-test-cookies.txt"

echo "🧪 Task 4 Sanity Checks - Auth.js Credentials Provider"
echo "======================================================="
echo ""

# Clean up old cookies
rm -f "$COOKIES_FILE"

# Check 1: CSRF endpoint
echo "✅ Check 1: CSRF endpoint returns token"
echo "---------------------------------------"
CSRF_RESPONSE=$(curl -s "$API_URL/v1/auth/csrf")
CSRF_TOKEN=$(echo "$CSRF_RESPONSE" | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$CSRF_TOKEN" ]; then
  echo "❌ FAILED: No CSRF token returned"
  exit 1
fi

echo "✅ PASSED: CSRF token obtained: ${CSRF_TOKEN:0:20}..."
echo ""

# Check 2: Providers endpoint includes credentials
echo "✅ Check 2: Providers endpoint includes credentials"
echo "---------------------------------------------------"
PROVIDERS_RESPONSE=$(curl -s "$API_URL/v1/auth/providers")

if echo "$PROVIDERS_RESPONSE" | grep -q '"credentials"'; then
  echo "✅ PASSED: Credentials provider found"
else
  echo "❌ FAILED: Credentials provider not found"
  exit 1
fi
echo ""

# Check 3: Sign-in with valid credentials
echo "✅ Check 3: Sign-in with valid credentials"
echo "------------------------------------------"
CSRF_TOKEN=$(curl -s -c "$COOKIES_FILE" "$API_URL/v1/auth/csrf" | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4)

SIGNIN_RESPONSE=$(curl -s -i -X POST "$API_URL/v1/auth/callback/credentials" \
  -b "$COOKIES_FILE" \
  -c "$COOKIES_FILE" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=superbasicman@gmail.com&password=password123.&csrfToken=$CSRF_TOKEN")

if echo "$SIGNIN_RESPONSE" | grep -q "authjs.session-token"; then
  echo "✅ PASSED: Session cookie set"
else
  echo "❌ FAILED: No session cookie set"
  echo "$SIGNIN_RESPONSE"
  exit 1
fi
echo ""

# Check 4: Session endpoint returns user data
echo "✅ Check 4: Session endpoint returns user data"
echo "----------------------------------------------"
SESSION_RESPONSE=$(curl -s -b "$COOKIES_FILE" "$API_URL/v1/auth/session")

if echo "$SESSION_RESPONSE" | grep -q '"user"'; then
  echo "✅ PASSED: Session contains user data"
  echo "$SESSION_RESPONSE" | jq '.' 2>/dev/null || echo "$SESSION_RESPONSE"
else
  echo "❌ FAILED: Session does not contain user data"
  exit 1
fi
echo ""

# Check 5: Sign-out clears session
echo "✅ Check 5: Sign-out clears session"
echo "-----------------------------------"
CSRF_TOKEN=$(curl -s -b "$COOKIES_FILE" "$API_URL/v1/auth/csrf" | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4)

SIGNOUT_RESPONSE=$(curl -s -i -X POST "$API_URL/v1/auth/signout" \
  -b "$COOKIES_FILE" \
  -c "$COOKIES_FILE" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "csrfToken=$CSRF_TOKEN")

if echo "$SIGNOUT_RESPONSE" | grep -q "Max-Age=0"; then
  echo "✅ PASSED: Session cookie cleared"
else
  echo "❌ FAILED: Session cookie not cleared"
  exit 1
fi
echo ""

# Check 6: Session endpoint returns null after sign-out
echo "✅ Check 6: Session endpoint returns null after sign-out"
echo "--------------------------------------------------------"
SESSION_RESPONSE=$(curl -s -b "$COOKIES_FILE" "$API_URL/v1/auth/session")

if echo "$SESSION_RESPONSE" | grep -q 'null' || echo "$SESSION_RESPONSE" | grep -q '{}'; then
  echo "✅ PASSED: Session is null after sign-out"
else
  echo "❌ FAILED: Session still active after sign-out"
  echo "$SESSION_RESPONSE"
  exit 1
fi
echo ""

# Check 7: Sign-in with invalid credentials fails
echo "✅ Check 7: Sign-in with invalid credentials fails"
echo "--------------------------------------------------"
rm -f "$COOKIES_FILE"
CSRF_TOKEN=$(curl -s -c "$COOKIES_FILE" "$API_URL/v1/auth/csrf" | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4)

SIGNIN_RESPONSE=$(curl -s -i -X POST "$API_URL/v1/auth/callback/credentials" \
  -b "$COOKIES_FILE" \
  -c "$COOKIES_FILE" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=superbasicman@gmail.com&password=wrongpassword&csrfToken=$CSRF_TOKEN")

if echo "$SIGNIN_RESPONSE" | grep -q "error=CredentialsSignin"; then
  echo "✅ PASSED: Invalid credentials rejected"
else
  echo "❌ FAILED: Invalid credentials not rejected properly"
  exit 1
fi
echo ""

echo "🎉 All Task 4 Sanity Checks Passed!"
echo "===================================="
echo ""
echo "Summary:"
echo "  ✅ CSRF endpoint working"
echo "  ✅ Credentials provider configured"
echo "  ✅ Valid credentials sign-in working"
echo "  ✅ Session endpoint working"
echo "  ✅ Sign-out working"
echo "  ✅ Session cleared after sign-out"
echo "  ✅ Invalid credentials rejected"
