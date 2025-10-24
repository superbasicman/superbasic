#!/bin/bash
# Test script for Auth.js magic link flow
# Usage: ./tooling/scripts/test-magic-link-flow.sh [email]

set -e

EMAIL="${1:-test@example.com}"
COOKIE_FILE="/tmp/authjs-test-cookies.txt"

echo "🧪 Testing Auth.js Magic Link Flow"
echo "=================================="
echo ""

# Step 1: Get CSRF token
echo "📝 Step 1: Getting CSRF token..."
CSRF_RESPONSE=$(curl -s -c "$COOKIE_FILE" http://localhost:3000/v1/auth/csrf)
CSRF_TOKEN=$(echo "$CSRF_RESPONSE" | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$CSRF_TOKEN" ]; then
  echo "❌ Failed to get CSRF token"
  exit 1
fi

echo "✅ CSRF Token: ${CSRF_TOKEN:0:20}..."
echo ""

# Step 2: Request magic link
echo "📧 Step 2: Requesting magic link for $EMAIL..."
RESPONSE=$(curl -s -i -X POST http://localhost:3000/v1/auth/signin/nodemailer \
  -b "$COOKIE_FILE" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=$EMAIL&csrfToken=$CSRF_TOKEN")

# Check for successful redirect
if echo "$RESPONSE" | grep -q "HTTP/1.1 302"; then
  LOCATION=$(echo "$RESPONSE" | grep -i "^location:" | cut -d' ' -f2 | tr -d '\r')
  
  if echo "$LOCATION" | grep -q "verify-request"; then
    echo "✅ Magic link request successful!"
    echo "   Redirect: $LOCATION"
    echo ""
    echo "📬 Check your email at $EMAIL for the magic link"
    echo ""
    echo "🔗 The magic link will look like:"
    echo "   http://localhost:3000/v1/auth/callback/nodemailer?token=...&email=$EMAIL"
    echo ""
    echo "✨ Click the link to complete sign-in"
  else
    echo "❌ Unexpected redirect location: $LOCATION"
    exit 1
  fi
else
  echo "❌ Failed to request magic link"
  echo "$RESPONSE"
  exit 1
fi

# Cleanup
rm -f "$COOKIE_FILE"
