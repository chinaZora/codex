from fastapi import APIRouter
from shared_schema.models import SessionDebugRequest
from app.services.session_service import SessionFacade

router = APIRouter(prefix='/sessions', tags=['sessions'])
service = SessionFacade()


@router.post('/debug')
def debug_session(payload: SessionDebugRequest):
    return service.debug_message(payload)
