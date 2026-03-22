from __future__ import annotations

from shared_schema.models import KnowledgeChunk, KnowledgeSource


class KnowledgeService:
    def __init__(self, demo_data: tuple[list[KnowledgeSource], list[KnowledgeChunk]]):
        self.sources, self.chunks = demo_data

    def list_sources(self) -> list[KnowledgeSource]:
        return self.sources

    def ingest_document(self, source: KnowledgeSource, chunks: list[KnowledgeChunk]) -> None:
        self.sources.append(source)
        self.chunks.extend(chunks)

    def build_index(self) -> None:
        # TODO: replace with vector index / BM25 hybrid indexing.
        return None

    def search(self, query: str, filters: dict | None = None) -> list[KnowledgeChunk]:
        filters = filters or {}
        source_id = filters.get('source_id')
        normalized_query = query.lower()
        results = []
        for chunk in self.chunks:
            if source_id and chunk.source_id != source_id:
                continue
            score = sum(1 for token in normalized_query.split() if token and token in chunk.content.lower())
            if score or normalized_query[:2] in chunk.content.lower():
                results.append(chunk.model_copy(update={'score': float(score or 1)}))
        return sorted(results, key=lambda item: item.score, reverse=True)[:3]
