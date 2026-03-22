from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import httpx


@dataclass
class ChatResult:
    content: str
    raw: dict[str, Any]


class BaseChatProvider:
    def chat(self, messages: list[dict[str, str]], **kwargs: Any) -> ChatResult:
        raise NotImplementedError


class BaseEmbeddingProvider:
    def embed(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError


class MockChatProvider(BaseChatProvider):
    def chat(self, messages: list[dict[str, str]], **kwargs: Any) -> ChatResult:
        latest = messages[-1]['content'] if messages else ''
        return ChatResult(content=f"[mock-provider] 已处理输入：{latest}", raw={'provider': 'mock'})


class OpenAICompatibleProvider(BaseChatProvider):
    def __init__(self, base_url: str, api_key: str, model: str, timeout: float = 20.0, retries: int = 2):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.model = model
        self.timeout = timeout
        self.retries = retries

    def chat(self, messages: list[dict[str, str]], **kwargs: Any) -> ChatResult:
        payload = {'model': self.model, 'messages': messages, **kwargs}
        headers = {'Authorization': f'Bearer {self.api_key}'}
        last_error: Exception | None = None
        for _ in range(self.retries + 1):
            try:
                with httpx.Client(timeout=self.timeout) as client:
                    response = client.post(f'{self.base_url}/chat/completions', json=payload, headers=headers)
                    response.raise_for_status()
                    data = response.json()
                content = data['choices'][0]['message']['content']
                return ChatResult(content=content, raw=data)
            except Exception as exc:  # TODO: refine vendor specific error mapping.
                last_error = exc
        raise RuntimeError(f'OpenAI-compatible provider failed: {last_error}')

    def vision(self, inputs: list[Any]) -> ChatResult:
        raise NotImplementedError('TODO: add vision support')

    def rerank(self, query: str, docs: list[str]) -> list[int]:
        raise NotImplementedError('TODO: add rerank support')
