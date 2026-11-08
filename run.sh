#!/usr/bin/env bash
# Start Deja View on :8000 and (optionally) expose it publicly with a Cloudflare quick tunnel.
#   ./run.sh           local only  -> http://127.0.0.1:8000
#   ./run.sh --public  also prints a https://*.trycloudflare.com URL (for Wren / judges)
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d frontend/dist ]; then (cd frontend && pnpm install && pnpm build); fi
if [ ! -d backend/.venv ]; then
  uv venv backend/.venv --python 3.12 && uv pip install -p backend/.venv/bin/python -r backend/requirements.txt
  backend/.venv/bin/python -m playwright install chromium
fi
backend/.venv/bin/uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 &
API=$!
trap 'kill $API 2>/dev/null' EXIT
if [ "${1:-}" = "--public" ]; then cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8000; else wait $API; fi
