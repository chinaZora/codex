from fastapi import APIRouter
from shared_schema.models import KnowledgeSearchRequest
from app.services.knowledge_service import KnowledgeFacade

router = APIRouter(prefix='/knowledge', tags=['knowledge'])
service = KnowledgeFacade()


@router.get('/sources')
def list_sources():
    return service.list_sources()


@router.post('/search')
def search(payload: KnowledgeSearchRequest):
    return service.search(payload)
