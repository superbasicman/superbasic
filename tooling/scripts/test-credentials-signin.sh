#!/bin/bash

# Test Auth.js credentials sign-in flow
# Usage: ./tooling/scripts/test-credentials-signin.sh

set -e

API_URL="http://localhost:3000"
COOKIES_FILE="/tmp/authjs-test-cookies.txt"

echo "🧪 Testing Auth.js Credentials Sign-In Flow"
echo "==========================================="
echo ""

# Clean up old cookies
rm -f "$COOKIES_FILE"

# Step 1: Get CSRF token
echo "📝 Step 1: Fetching CSRF token..."
CSRF_RESPONSE=$(curl -s -c "$COOKIES_FILE" "$API_URL/v1/auth/csrf")
CSRF_TOKEN=$(echo "$CSRF_RESPONSE" | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$CSRF_TOKEN" ]; then
  echo "❌ Failed to extract CSRF token"
  echo "Response: $CSRF_RESPONSE"
  exit 1
fi

echo "✅ CSRF token obtained: ${CSRF_TOKEN:0:20}..."
echo ""

# Step 2: Sign in with credentials
echo "📝 Step 2: Signing in with credentials..."
echo "Email: superbasicman@gmail.com"
echo "Password: password123."
echo "CSRF Token: ${CSRF_TOKEN:0:20}..."
echo ""

# Show the request data
REQUEST_DATA="email=superbasicman@gmail.com&password=password123.&csrfToken=$CSRF_TOKEN"
echo "Request data: $REQUEST_DATA"
echo ""

SIGNIN_RESPONSE=$(curl -s -i -X POST "$API_URL/v1/auth/callback/credentials" \
  -b "$COOKIES_FILE" \
  -c "$COOKIES_FILE" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "$REQUEST_DATA")

echo "$SIGNIN_RESPONSE"
echo ""

# Check for session cookie
if grep -q "authjs.session-token" "$COOKIES_FILE"; then
  echo "✅ Session cookie set successfully"
  echo ""
  echo "Cookie contents:"
  cat "$COOKIES_FILE" | grep "authjs.session-token"
else
  echo "❌ No session cookie found"
  exit 1
fi

echo ""
echo "🎉 Credentials sign-in test complete!"
