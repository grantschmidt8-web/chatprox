#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${RENDER_SERVICE_ROOT:-$(pwd)}"
PACKAGE_JSON_PATH="$PROJECT_ROOT/package.json"

if [ -f "$PACKAGE_JSON_PATH" ]; then
  cd "$PROJECT_ROOT"
  echo "Installing dependencies from $PACKAGE_JSON_PATH"
  npm install --ignore-scripts --no-audit --no-fund
else
  echo "No package.json at $PACKAGE_JSON_PATH; skipping npm install"
fi
