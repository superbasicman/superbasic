#!/bin/bash

# Create placeholder PWA icons using base64-encoded minimal PNGs
# These are 1x1 pixel PNGs that will be scaled by browsers

PUBLIC_DIR="apps/web/public"
mkdir -p "$PUBLIC_DIR"

# Minimal 1x1 blue PNG (base64 encoded)
BLUE_PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

# Create all required icon files
echo "$BLUE_PNG" | base64 -d > "$PUBLIC_DIR/pwa-192x192.png"
echo "$BLUE_PNG" | base64 -d > "$PUBLIC_DIR/pwa-512x512.png"
echo "$BLUE_PNG" | base64 -d > "$PUBLIC_DIR/apple-touch-icon.png"
echo "$BLUE_PNG" | base64 -d > "$PUBLIC_DIR/favicon.png"

# Create favicon.ico (same minimal PNG)
echo "$BLUE_PNG" | base64 -d > "$PUBLIC_DIR/favicon.ico"

# Create SVG favicon with "SBF" text
cat > "$PUBLIC_DIR/favicon.svg" << 'EOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="100" height="100" fill="url(#grad)" rx="20"/>
  <text x="50" y="65" font-family="sans-serif" font-size="40" font-weight="bold" fill="white" text-anchor="middle">SBF</text>
</svg>
EOF

echo "✅ Created placeholder PWA icons in $PUBLIC_DIR:"
ls -lh "$PUBLIC_DIR"
