from shared_schema.models import KnowledgeSearchRequest
from app.container import knowledge_service


class KnowledgeFacade:
    def list_sources(self):
        return knowledge_service.list_sources()

    def search(self, payload: KnowledgeSearchRequest):
        return knowledge_service.search(payload.query, payload.filters)
