#!/usr/bin/env bash
set -euo pipefail

export PYTHONPATH="apps/api:packages/shared-schema:packages/agent-runtime:packages/model-gateway:packages/tool-hub:packages/knowledge-service:packages/memory-service:packages/audit-service:packages/im-adapter"

python -m python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --app-dir apps/api &
API_PID=$!

npm --workspace apps/web run dev &
WEB_PID=$!

trap 'kill ${API_PID} ${WEB_PID}' EXIT
wait
