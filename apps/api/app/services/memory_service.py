from app.container import memory_service


class MemoryFacade:
    def get_session_memory(self, session_id: str):
        return memory_service.read_short_term(session_id)

    def list_long_term(self):
        return memory_service.list_long_term()
