from shared_schema.models import SessionDebugRequest
from app.container import agent_runtime


class SessionFacade:
    def debug_message(self, payload: SessionDebugRequest):
        return agent_runtime.handle_message(payload)
