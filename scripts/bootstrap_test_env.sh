#!/usr/bin/env bash
# Bootstrap script for the chess-bot test environment.
# This project uses Node.js (node:test runner) — no external npm dependencies needed.
set -euo pipefail

REQUIRED_NODE_MAJOR=22

node_version=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ -z "$node_version" ] || [ "$node_version" -lt "$REQUIRED_NODE_MAJOR" ]; then
  echo "[bootstrap] ERROR: Node.js >= ${REQUIRED_NODE_MAJOR} required (found: $(node --version 2>/dev/null || echo 'none'))"
  exit 1
fi

echo "[bootstrap] Node.js $(node --version) — OK"
echo "[bootstrap] npm $(npm --version) — OK"
echo "[bootstrap] No external dependencies to install (zero npm deps)"
echo "[bootstrap] Environment ready. Run:"
echo "  npm test                  # 59 unit tests (node:test)"
echo "  npm run test:conformance   # contract fixture validation (TypeScript)"
echo "  npm start                  # stream loop (requires LICHESS_BOT_TOKEN)"
