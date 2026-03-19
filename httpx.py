from __future__ import annotations

import json
import urllib.request


class SimpleResponse:
    def __init__(self, status: int, payload: bytes):
        self.status_code = status
        self._payload = payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f'HTTP status {self.status_code}')

    def json(self):
        return json.loads(self._payload.decode('utf-8'))


class Client:
    def __init__(self, timeout: float = 20.0):
        self.timeout = timeout

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def post(self, url: str, json=None, headers=None):
        data = None if json is None else __import__('json').dumps(json).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers=headers or {}, method='POST')
        with urllib.request.urlopen(req, timeout=self.timeout) as response:
            return SimpleResponse(response.status, response.read())
