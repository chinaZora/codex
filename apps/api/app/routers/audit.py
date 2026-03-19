from fastapi import APIRouter
from app.services.audit_service import AuditFacade

router = APIRouter(prefix='/audit', tags=['audit'])
service = AuditFacade()


@router.get('')
def list_audit_events(session_id: str | None = None, agent_id: str | None = None, user_id: str | None = None):
    return service.list_events(session_id=session_id, agent_id=agent_id, user_id=user_id)
