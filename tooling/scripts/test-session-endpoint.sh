#!/bin/bash

# Test Auth.js session endpoint
# Usage: ./tooling/scripts/test-session-endpoint.sh

set -e

API_URL="http://localhost:3000"
COOKIES_FILE="/tmp/authjs-test-cookies.txt"

echo "🧪 Testing Auth.js Session Endpoint"
echo "===================================="
echo ""

# Check if we have a session cookie
if [ ! -f "$COOKIES_FILE" ] || ! grep -q "authjs.session-token" "$COOKIES_FILE"; then
  echo "❌ No session cookie found. Run test-credentials-signin.sh first."
  exit 1
fi

echo "✅ Session cookie found"
echo ""

# Test /v1/auth/session endpoint
echo "📝 Testing GET /v1/auth/session..."
SESSION_RESPONSE=$(curl -s -b "$COOKIES_FILE" "$API_URL/v1/auth/session")

echo "$SESSION_RESPONSE" | jq '.' 2>/dev/null || echo "$SESSION_RESPONSE"
echo ""

# Check if session is valid
if echo "$SESSION_RESPONSE" | grep -q '"user"'; then
  echo "✅ Session is valid!"
else
  echo "❌ Session is invalid or expired"
  exit 1
fi

echo ""
echo "🎉 Session endpoint test complete!"
