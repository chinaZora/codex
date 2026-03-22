PYTHONPATH=apps/api:packages/shared-schema:packages/agent-runtime:packages/model-gateway:packages/tool-hub:packages/knowledge-service:packages/memory-service:packages/audit-service:packages/im-adapter

.PHONY: api web test bootstrap-demo

api:
	PYTHONPATH=$(PYTHONPATH) python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --app-dir apps/api

web:
	npm --workspace apps/web run dev

test:
	PYTHONPATH=$(PYTHONPATH) pytest

bootstrap-demo:
	bash infra/scripts/bootstrap_demo_data.sh
