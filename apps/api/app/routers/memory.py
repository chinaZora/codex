from fastapi import APIRouter
from app.services.memory_service import MemoryFacade

router = APIRouter(prefix='/memory', tags=['memory'])
service = MemoryFacade()


@router.get('/short-term/{session_id}')
def get_short_term_memory(session_id: str):
    return service.get_session_memory(session_id)


@router.get('/long-term')
def list_long_term_memory():
    return service.list_long_term()
