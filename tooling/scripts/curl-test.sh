#!/usr/bin/env bash
# curl-test.sh
# Quick manual flow: credentials login -> token exchange -> /v1/me -> PAT create/list

set -euo pipefail

API_URL="http://localhost:3000"
EMAIL=""
PASSWORD=""
PAT_NAME="cli-test"
PAT_SCOPES='["read:accounts"]'

usage() {
  cat <<EOF
Usage: pnpm curl-test -- --email you@example.com --password secret [--api-url http://localhost:3000] [--pat-name cli-test] [--pat-scopes '["read:accounts"]']
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift;;
    --api-url)
      API_URL="$2"; shift 2;;
    --email)
      EMAIL="$2"; shift 2;;
    --password)
      PASSWORD="$2"; shift 2;;
    --pat-name)
      PAT_NAME="$2"; shift 2;;
    --pat-scopes)
      PAT_SCOPES="$2"; shift 2;;
    -h|--help)
      usage; exit 0;;
    *)
      echo "Unknown option: $1" >&2
      usage; exit 1;;
  esac
done

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo "Error: --email and --password are required." >&2
  usage
  exit 1
fi

JAR="$(mktemp)"
cleanup() { rm -f "$JAR"; }
trap cleanup EXIT

echo "1) Get CSRF token"
CSRF="$(curl -s -c "$JAR" "$API_URL/v1/auth/csrf" | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')"
if [[ -z "$CSRF" ]]; then
  echo "Failed to fetch CSRF token" >&2
  exit 1
fi

echo "2) Credentials login (sets session cookie)"
curl -s -b "$JAR" -c "$JAR" -X POST "$API_URL/v1/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "email=$EMAIL" \
  --data-urlencode "password=$PASSWORD" \
  --data-urlencode "csrfToken=$CSRF" \
  -o /dev/null -w "Status: %{http_code}\n"

echo "3) Exchange session for access/refresh tokens"
TOKENS="$(curl -s -b "$JAR" -H "Content-Type: application/json" \
  -d '{"clientType":"web","rememberMe":false}' \
  "$API_URL/v1/auth/token")"
echo "$TOKENS"
ACCESS_TOKEN="$(printf "%s" "$TOKENS" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')"
if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "Failed to obtain access token" >&2
  exit 1
fi

echo "4) Call /v1/me"
curl -s -H "Authorization: Bearer $ACCESS_TOKEN" "$API_URL/v1/me"
echo

echo "5) Create a PAT (name=$PAT_NAME scopes=$PAT_SCOPES)"
curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$PAT_NAME\",\"scopes\":$PAT_SCOPES}" \
  "$API_URL/v1/tokens"
echo

echo "6) List PATs"
curl -s -H "Authorization: Bearer $ACCESS_TOKEN" "$API_URL/v1/tokens"
echo

echo "Done. Cookie jar: $JAR"
