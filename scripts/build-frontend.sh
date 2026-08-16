#!/bin/sh
# Rebuild the Next.js static export (frontend/out) and leave it staged for
# commit. Render's Docker image serves frontend/out directly — the export is
# committed so Docker never needs to build the frontend (keeps the free-tier
# build within its resource limits).
#
# Usage:  sh scripts/build-frontend.sh
set -e
cd "$(dirname "$0")/../frontend"

echo "[frontend] npm ci (fresh deps)..."
npm ci --no-audit --no-fund

echo "[frontend] next build (static export) -> out/"
npm run build

echo
echo "Static export ready at frontend/out. Commit it with:"
echo "  git add Fx-analyzer/frontend/out && git commit -m 'build: rebuild frontend static export'"
