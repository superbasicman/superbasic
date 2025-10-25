#!/bin/bash

# Test Auth.js sign-out flow
# Usage: ./tooling/scripts/test-signout.sh

set -e

API_URL="http://localhost:3000"
COOKIES_FILE="/tmp/authjs-test-cookies.txt"

echo "🧪 Testing Auth.js Sign-Out Flow"
echo "================================="
echo ""

# Check if we have a session cookie
if [ ! -f "$COOKIES_FILE" ] || ! grep -q "authjs.session-token" "$COOKIES_FILE"; then
  echo "❌ No session cookie found. Run test-credentials-signin.sh first."
  exit 1
fi

echo "✅ Session cookie found before sign-out"
echo ""

# Get CSRF token for sign-out
echo "📝 Step 1: Fetching CSRF token..."
CSRF_RESPONSE=$(curl -s -b "$COOKIES_FILE" "$API_URL/v1/auth/csrf")
CSRF_TOKEN=$(echo "$CSRF_RESPONSE" | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$CSRF_TOKEN" ]; then
  echo "❌ Failed to extract CSRF token"
  exit 1
fi

echo "✅ CSRF token obtained: ${CSRF_TOKEN:0:20}..."
echo ""

# Sign out
echo "📝 Step 2: Signing out..."
SIGNOUT_RESPONSE=$(curl -s -i -X POST "$API_URL/v1/auth/signout" \
  -b "$COOKIES_FILE" \
  -c "$COOKIES_FILE" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "csrfToken=$CSRF_TOKEN")

echo "$SIGNOUT_RESPONSE"
echo ""

# Check if session cookie was cleared
if grep -q "authjs.session-token" "$COOKIES_FILE"; then
  # Check if it's expired (Max-Age=0 or expires in the past)
  if echo "$SIGNOUT_RESPONSE" | grep -q "Max-Age=0"; then
    echo "✅ Session cookie cleared (Max-Age=0)"
  else
    echo "⚠️  Session cookie still present but may be expired"
  fi
else
  echo "✅ Session cookie removed from cookie file"
fi

echo ""
echo "🎉 Sign-out test complete!"
