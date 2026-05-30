#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT="${PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

echo "Starting Truth Terminal backend on port ${BACKEND_PORT}"
(
  cd "$ROOT_DIR/backend"
  uvicorn main:app --reload --host 0.0.0.0 --port "$BACKEND_PORT"
) &
BACKEND_PID=$!

echo "Starting Truth Terminal frontend on port ${FRONTEND_PORT}"
(
  cd "$ROOT_DIR/frontend"
  npm run dev -- --port "$FRONTEND_PORT"
) &
FRONTEND_PID=$!

cleanup() {
  echo "Stopping Truth Terminal..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

wait "$BACKEND_PID" "$FRONTEND_PID"
