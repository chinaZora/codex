from __future__ import annotations

import argparse
import importlib
import json
from wsgiref.simple_server import make_server


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('app_path')
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--app-dir', default='.')
    parser.add_argument('--reload', action='store_true')
    args = parser.parse_args()

    module_name, app_name = args.app_path.split(':', 1)
    module = importlib.import_module(module_name)
    app = getattr(module, app_name)

    def wsgi_app(environ, start_response):
        method = environ['REQUEST_METHOD']
        path = environ['PATH_INFO']
        query = environ.get('QUERY_STRING', '')
        length = int(environ.get('CONTENT_LENGTH') or 0)
        body = environ['wsgi.input'].read(length) if length else b''
        json_body = json.loads(body.decode('utf-8')) if body else None
        status_code, data = app.dispatch(method, path, json_body=json_body, query_string=query)
        payload = json.dumps(_serialize(data), ensure_ascii=False).encode('utf-8')
        start_response(f'{status_code} OK', [('Content-Type', 'application/json; charset=utf-8')])
        return [payload]

    httpd = make_server(args.host, args.port, wsgi_app)
    print(f'Serving on http://{args.host}:{args.port}')
    httpd.serve_forever()


def _serialize(value):
    if hasattr(value, 'model_dump'):
        return value.model_dump()
    if isinstance(value, list):
        return [_serialize(item) for item in value]
    if isinstance(value, dict):
        return {key: _serialize(item) for key, item in value.items()}
    return value


if __name__ == '__main__':
    main()
