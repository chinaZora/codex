from __future__ import annotations

from shared_schema.models import AuditEvent


class InMemoryAuditStore:
    def __init__(self):
        self.events: list[AuditEvent] = []

    def add(self, event: AuditEvent) -> None:
        self.events.append(event)

    def query(self, session_id: str | None = None, agent_id: str | None = None, user_id: str | None = None) -> list[AuditEvent]:
        events = self.events
        if session_id:
            events = [item for item in events if item.session_id == session_id]
        if agent_id:
            events = [item for item in events if item.agent_id == agent_id]
        if user_id:
            events = [item for item in events if item.user_id == user_id]
        return list(reversed(events))[:100]
