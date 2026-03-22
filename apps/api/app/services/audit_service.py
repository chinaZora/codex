from app.container import audit_store


class AuditFacade:
    def list_events(self, session_id: str | None = None, agent_id: str | None = None, user_id: str | None = None):
        return audit_store.query(session_id=session_id, agent_id=agent_id, user_id=user_id)
