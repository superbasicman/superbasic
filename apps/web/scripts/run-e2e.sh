#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}Starting E2E test environment...${NC}"

# Function to cleanup background processes on exit
cleanup() {
  echo -e "\n${BLUE}Cleaning up...${NC}"
  if [ ! -z "$API_PID" ]; then
    kill $API_PID 2>/dev/null || true
  fi
  if [ ! -z "$WEB_PID" ]; then
    kill $WEB_PID 2>/dev/null || true
  fi
  exit
}

trap cleanup EXIT INT TERM

# Navigate to workspace root (two levels up from apps/web/scripts)
cd "$(dirname "$0")/../../.."

# Start API server in background
echo -e "${BLUE}Starting API server (test mode)...${NC}"
pnpm --filter=@repo/api dev:test > /tmp/e2e-api.log 2>&1 &
API_PID=$!

# Start web server in background
echo -e "${BLUE}Starting web dev server...${NC}"
pnpm --filter=@repo/web dev > /tmp/e2e-web.log 2>&1 &
WEB_PID=$!

# Wait for API server to be ready
echo -e "${BLUE}Waiting for API server...${NC}"
for i in {1..30}; do
  if curl -s http://localhost:3000/v1/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ API server ready${NC}"
    break
  fi
  if [ $i -eq 30 ]; then
    echo -e "${RED}✗ API server failed to start${NC}"
    echo "API logs:"
    cat /tmp/e2e-api.log
    exit 1
  fi
  sleep 1
done

# Wait for web server to be ready
echo -e "${BLUE}Waiting for web server...${NC}"
for i in {1..30}; do
  if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Web server ready${NC}"
    break
  fi
  if [ $i -eq 30 ]; then
    echo -e "${RED}✗ Web server failed to start${NC}"
    echo "Web logs:"
    cat /tmp/e2e-web.log
    exit 1
  fi
  sleep 1
done

# Run Playwright tests
echo -e "${BLUE}Running E2E tests...${NC}"
cd apps/web
E2E_MANUAL_SERVERS=true pnpm exec playwright test "$@"
TEST_EXIT_CODE=$?

# Cleanup will happen automatically via trap
exit $TEST_EXIT_CODE
