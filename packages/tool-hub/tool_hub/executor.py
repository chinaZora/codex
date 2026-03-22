from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from shared_schema.models import AuditEvent, ToolCall
from audit_service.store import InMemoryAuditStore
from .registry import ToolRegistry


@dataclass
class ToolContext:
    agent_id: str
    session_id: str
    user_id: str


class ToolExecutor:
    def __init__(self, registry: ToolRegistry, audit_store: InMemoryAuditStore):
        self.registry = registry
        self.audit_store = audit_store

    def execute(self, tool_id: str, arguments: dict, context: ToolContext) -> ToolCall:
        registered = self.registry.get(tool_id)
        result = registered.handler(arguments)
        call = ToolCall(tool_id=tool_id, arguments=arguments, result=result)
        self.audit_store.add(
            AuditEvent(
                id=f"audit-tool-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
                event_type='tool_call',
                agent_id=context.agent_id,
                session_id=context.session_id,
                user_id=context.user_id,
                details={'tool_id': tool_id, 'arguments': arguments, 'result': result},
            )
        )
        return call
