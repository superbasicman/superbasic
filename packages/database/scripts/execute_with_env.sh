#!/bin/sh

# Usage: ./scripts/execute_with_env.sh <command> [args...]
# Example: ./scripts/execute_with_env.sh prisma generate

if [ -f .env.local ]; then
  # Use dotenv-cli if .env.local exists to load environment variables
  exec dotenv -e .env.local -- "$@"
else
  # Otherwise execute the command directly (relying on system/CI env vars)
  exec "$@"
fi
