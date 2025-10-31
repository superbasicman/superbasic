#!/bin/bash

# Verify PWA setup is complete

echo "🔍 Verifying PWA Setup..."
echo ""

# Check if public directory exists
if [ ! -d "apps/web/public" ]; then
  echo "❌ apps/web/public directory not found"
  exit 1
fi
echo "✅ Public directory exists"

# Check required icon files
REQUIRED_FILES=(
  "apps/web/public/pwa-192x192.png"
  "apps/web/public/pwa-512x512.png"
  "apps/web/public/apple-touch-icon.png"
  "apps/web/public/favicon.svg"
)

for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "❌ Missing: $file"
    exit 1
  fi
  echo "✅ Found: $(basename $file)"
done

# Check vite config
if ! grep -q "vite-plugin-pwa" apps/web/vite.config.ts; then
  echo "❌ vite-plugin-pwa not configured in vite.config.ts"
  exit 1
fi
echo "✅ vite-plugin-pwa configured"

# Check if package is installed
if ! grep -q "vite-plugin-pwa" apps/web/package.json; then
  echo "❌ vite-plugin-pwa not installed"
  exit 1
fi
echo "✅ vite-plugin-pwa installed"

echo ""
echo "✅ PWA setup is complete!"
echo ""
echo "To test:"
echo "  1. Build: pnpm build --filter=web"
echo "  2. Preview: pnpm preview --filter=web"
echo "  3. Open DevTools → Application → Manifest"
echo "  4. Check Service Workers tab for active worker"
