from __future__ import annotations

from collections import defaultdict
from shared_schema.models import MemoryItem


class MemoryService:
    def __init__(self):
        self.short_term: dict[str, list[MemoryItem]] = defaultdict(list)
        self.long_term: list[MemoryItem] = [
            MemoryItem(id='lt-1', scope='tenant', type='fact', content='HR 平台默认以 tenant 级别隔离数据。'),
            MemoryItem(id='lt-2', scope='group', type='preference', content='招聘群偏好简洁结论与行动建议。', group_id='recruitment-group'),
        ]

    def read_short_term(self, session_id: str) -> list[MemoryItem]:
        return self.short_term.get(session_id, [])[-8:]

    def append_short_term(self, session_id: str, item: MemoryItem) -> None:
        self.short_term[session_id].append(item)

    def write_long_term(self, item: MemoryItem) -> None:
        self.long_term.append(item)

    def list_long_term(self) -> list[MemoryItem]:
        return self.long_term
