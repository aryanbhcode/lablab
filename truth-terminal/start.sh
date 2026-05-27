#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting Truth Terminal backend on http://localhost:8000"
(
  cd "$ROOT_DIR/backend"
  uvicorn main:app --reload --port 8000
) &
BACKEND_PID=$!

echo "Starting Truth Terminal frontend on http://localhost:3000"
(
  cd "$ROOT_DIR/frontend"
  npm run dev
) &
FRONTEND_PID=$!

cleanup() {
  echo "Stopping Truth Terminal..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

wait "$BACKEND_PID" "$FRONTEND_PID"
