#!/bin/bash

# Test Magic Link Rate Limiting
# Tests that magic link requests are limited to 3 per hour per email

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if email argument is provided
if [ -z "$1" ]; then
  echo -e "${RED}Error: Email address required${NC}"
  echo "Usage: $0 <email>"
  echo "Example: $0 test@example.com"
  exit 1
fi

EMAIL="$1"
API_URL="${API_URL:-http://localhost:3000}"
COOKIE_FILE="/tmp/authjs-cookies-rate-limit-test.txt"

echo -e "${YELLOW}Testing Magic Link Rate Limiting${NC}"
echo "Email: $EMAIL"
echo "API URL: $API_URL"
echo ""

# Clean up cookie file
rm -f "$COOKIE_FILE"

# Clear any existing rate limit for this email
echo -e "${YELLOW}Clearing existing rate limit...${NC}"
export $(cat apps/api/.env.local | grep UPSTASH | xargs)
pnpm tsx tooling/scripts/clear-magic-link-rate-limit.ts "$EMAIL" 2>/dev/null || echo "Note: Could not clear rate limit (may not exist)"
echo ""

# Function to request magic link
request_magic_link() {
  local attempt=$1
  
  echo -e "${YELLOW}Attempt $attempt: Requesting magic link...${NC}"
  
  # Get CSRF token
  CSRF_RESPONSE=$(curl -s -c "$COOKIE_FILE" "$API_URL/v1/auth/csrf")
  CSRF_TOKEN=$(echo "$CSRF_RESPONSE" | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4)
  
  if [ -z "$CSRF_TOKEN" ]; then
    echo -e "${RED}Failed to get CSRF token${NC}"
    return 1
  fi
  
  # Request magic link
  RESPONSE=$(curl -s -i -X POST "$API_URL/v1/auth/signin/nodemailer" \
    -b "$COOKIE_FILE" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "email=$EMAIL&csrfToken=$CSRF_TOKEN")
  
  # Extract status code
  STATUS=$(echo "$RESPONSE" | grep "HTTP/" | awk '{print $2}')
  
  # Extract rate limit headers
  LIMIT=$(echo "$RESPONSE" | grep -i "x-ratelimit-limit:" | awk '{print $2}' | tr -d '\r')
  REMAINING=$(echo "$RESPONSE" | grep -i "x-ratelimit-remaining:" | awk '{print $2}' | tr -d '\r')
  RETRY_AFTER=$(echo "$RESPONSE" | grep -i "retry-after:" | awk '{print $2}' | tr -d '\r')
  
  echo "Status: $STATUS"
  echo "Rate Limit: $LIMIT"
  echo "Remaining: $REMAINING"
  
  if [ "$STATUS" = "429" ]; then
    echo -e "${RED}Rate limited!${NC}"
    if [ -n "$RETRY_AFTER" ]; then
      echo "Retry after: $RETRY_AFTER seconds ($(($RETRY_AFTER / 60)) minutes)"
    fi
    return 2
  elif [ "$STATUS" = "302" ] || [ "$STATUS" = "200" ]; then
    echo -e "${GREEN}Request successful${NC}"
    return 0
  else
    echo -e "${RED}Unexpected status: $STATUS${NC}"
    echo "$RESPONSE"
    return 1
  fi
  
  echo ""
}

# Test: Make 4 requests (should succeed 3 times, fail on 4th)
echo -e "${YELLOW}Test: Rate limit enforcement (3 requests per hour)${NC}"
echo ""

SUCCESS_COUNT=0
RATE_LIMITED=false

for i in {1..4}; do
  if request_magic_link $i; then
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  elif [ $? -eq 2 ]; then
    RATE_LIMITED=true
    break
  else
    echo -e "${RED}Test failed with error${NC}"
    exit 1
  fi
  echo ""
  sleep 1
done

# Clean up
rm -f "$COOKIE_FILE"

# Verify results
echo -e "${YELLOW}Test Results:${NC}"
echo "Successful requests: $SUCCESS_COUNT"
echo "Rate limited: $RATE_LIMITED"
echo ""

if [ "$SUCCESS_COUNT" -eq 3 ] && [ "$RATE_LIMITED" = true ]; then
  echo -e "${GREEN}✓ Rate limiting working correctly!${NC}"
  echo "  - First 3 requests succeeded"
  echo "  - 4th request was rate limited (429)"
  exit 0
else
  echo -e "${RED}✗ Rate limiting not working as expected${NC}"
  echo "  Expected: 3 successful requests, then rate limited"
  echo "  Got: $SUCCESS_COUNT successful requests, rate limited: $RATE_LIMITED"
  exit 1
fi
