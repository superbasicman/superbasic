#!/bin/bash
# Load environment variables from .env.local files
set -a
[ -f packages/database/.env.local ] && source packages/database/.env.local
[ -f apps/api/.env.local ] && source apps/api/.env.local
set +a
echo "✅ Environment variables loaded"
