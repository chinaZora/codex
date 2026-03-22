from __future__ import annotations

import inspect
import re
from urllib.parse import parse_qs


class HTTPException(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


class Route:
    def __init__(self, method: str, path: str, endpoint):
        self.method = method
        self.path = path
        self.endpoint = endpoint
        pattern = re.sub(r'\{([^}]+)\}', lambda m: f"(?P<{m.group(1)}>[^/]+)", path)
        self.regex = re.compile(f'^{pattern}$')


class APIRouter:
    def __init__(self, prefix: str = '', tags=None):
        self.prefix = prefix
        self.tags = tags or []
        self.routes: list[Route] = []

    def add_api_route(self, path: str, endpoint, method: str):
        self.routes.append(Route(method, f'{self.prefix}{path}', endpoint))

    def get(self, path: str):
        return lambda endpoint: self._register(path, endpoint, 'GET')

    def post(self, path: str):
        return lambda endpoint: self._register(path, endpoint, 'POST')

    def put(self, path: str):
        return lambda endpoint: self._register(path, endpoint, 'PUT')

    def _register(self, path: str, endpoint, method: str):
        self.add_api_route(path, endpoint, method)
        return endpoint


class FastAPI(APIRouter):
    def __init__(self, title: str = 'app', version: str = '0.1.0'):
        super().__init__(prefix='')
        self.title = title
        self.version = version

    def include_router(self, router: APIRouter):
        self.routes.extend(router.routes)

    def add_middleware(self, *args, **kwargs):
        return None

    def dispatch(self, method: str, path: str, json_body=None, query_string: str = ''):
        for route in self.routes:
            match = route.regex.match(path)
            if route.method == method and match:
                kwargs = match.groupdict()
                query = {k: v[0] for k, v in parse_qs(query_string).items()}
                try:
                    params = inspect.signature(route.endpoint).parameters
                    values = []
                    for name, param in params.items():
                        ann = param.annotation
                        if name in kwargs:
                            values.append(kwargs[name])
                        elif name in query:
                            values.append(query[name])
                        elif json_body is not None and ann is not inspect._empty and hasattr(ann, '__mro__') and any(cls.__name__ == 'BaseModel' for cls in ann.__mro__):
                            values.append(ann(**json_body))
                        elif json_body is not None:
                            values.append(json_body)
                    result = route.endpoint(*values)
                    return 200, result
                except HTTPException as exc:
                    return exc.status_code, {'detail': exc.detail}
        return 404, {'detail': 'Not Found'}
