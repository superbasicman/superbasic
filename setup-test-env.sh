#!/bin/bash

# Setup Test Environment Variables
# This script creates .env.test from Gitpod environment variables

set -e

echo "Setting up test environment..."

# Check if required environment variables are set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL is not set"
    echo ""
    echo "Gitpod environment variables are not loaded in this session."
    echo ""
    echo "Options:"
    echo "1. Restart your Gitpod workspace to load the environment variables"
    echo "2. Or manually export them in this session:"
    echo "   export DATABASE_URL='your-database-url'"
    echo "   export AUTH_SECRET='your-auth-secret'"
    echo "   export UPSTASH_REDIS_REST_URL='your-redis-url'"
    echo "   export UPSTASH_REDIS_REST_TOKEN='your-redis-token'"
    echo ""
    echo "Then run this script again."
    exit 1
fi

# Create .env.test file
cat > apps/api/.env.test << EOF
# Test Environment Configuration
# Auto-generated from Gitpod environment variables

# Server Configuration
PORT=${PORT:-3000}
NODE_ENV=test

# Test Database
DATABASE_URL=${DATABASE_URL}

# Authentication
AUTH_SECRET=${AUTH_SECRET}
AUTH_URL=${AUTH_URL:-http://localhost:3000}
AUTH_TRUST_HOST=true

# Rate Limiting
UPSTASH_REDIS_REST_URL=${UPSTASH_REDIS_REST_URL}
UPSTASH_REDIS_REST_TOKEN=${UPSTASH_REDIS_REST_TOKEN}

# OAuth Providers
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-test_google_client_id}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-test_google_client_secret}
GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID:-test_github_client_id}
GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET:-test_github_client_secret}

# Email Provider
EMAIL_SERVER=${EMAIL_SERVER:-smtp://test:test@localhost:587}
EMAIL_FROM=${EMAIL_FROM:-test@superbasicfinance.com}
RESEND_API_KEY=${RESEND_API_KEY}

# Test Configuration
VITEST_MOCK_DATABASE=false
EOF

echo "✅ Created apps/api/.env.test"
echo ""
echo "Environment variables loaded:"
echo "  DATABASE_URL: ${DATABASE_URL:0:30}..."
echo "  AUTH_SECRET: ${AUTH_SECRET:0:10}..."
echo "  UPSTASH_REDIS_REST_URL: ${UPSTASH_REDIS_REST_URL:+[set]}"
echo "  UPSTASH_REDIS_REST_TOKEN: ${UPSTASH_REDIS_REST_TOKEN:+[set]}"
echo ""
echo "You can now run tests with:"
echo "  cd apps/api && pnpm test"
