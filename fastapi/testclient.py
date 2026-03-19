from __future__ import annotations

import json
from urllib.parse import urlparse


class Response:
    def __init__(self, status_code: int, data):
        self.status_code = status_code
        self._data = data

    def json(self):
        return _serialize(self._data)


class TestClient:
    def __init__(self, app):
        self.app = app

    def get(self, url: str):
        parsed = urlparse(url)
        status, data = self.app.dispatch('GET', parsed.path, query_string=parsed.query)
        return Response(status, data)

    def post(self, url: str, json=None):
        parsed = urlparse(url)
        status, data = self.app.dispatch('POST', parsed.path, json_body=json, query_string=parsed.query)
        return Response(status, data)


def _serialize(value):
    if hasattr(value, 'model_dump'):
        return value.model_dump()
    if isinstance(value, list):
        return [_serialize(item) for item in value]
    if isinstance(value, dict):
        return {key: _serialize(item) for key, item in value.items()}
    return value
