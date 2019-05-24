from http.server import BaseHTTPRequestHandler

import base64
import json

def _now_get_import():
    try:
        from __NOW_HANDLER_FILENAME import Handler
        assert issubclass(Handler, BaseHTTPRequestHandler)
        return Handler, True
    except:
        try:
            from __NOW_HANDLER_FILENAME import handler
            assert issubclass(handler, BaseHTTPRequestHandler)
            return handler, True
        except:
            from __NOW_HANDLER_FILENAME import app
            return app, False

_now_imported, _now_is_legacy = _now_get_import()

if _now_is_legacy:
    print('using HTTP Handler')
    from http.server import HTTPServer
    from urllib.parse import unquote
    import requests
    import _thread
    server = HTTPServer(('', 0), _now_imported)
    port = server.server_address[1]
    def now_handler(event, context):
        _thread.start_new_thread(server.handle_request, ())

        payload = json.loads(event['body'])
        path = unquote(payload['path'])
        headers = payload['headers']
        method = payload['method']
        encoding = payload.get('encoding')
        body = payload.get('body')

        if (
            (body is not None and len(body) > 0) and
            (encoding is not None and encoding == 'base64')
        ):
            body = base64.b64decode(body)

        res = requests.request(method, 'http://0.0.0.0:' + str(port) + path,
                            headers=headers, data=body, allow_redirects=False)

        return {
            'statusCode': res.status_code,
            'headers': dict(res.headers),
            'body': res.text,
        }
else:
    print('using Web Server Gateway Interface (WSGI)')
    import sys
    from urllib.parse import urlparse, unquote
    from werkzeug._compat import BytesIO
    from werkzeug._compat import string_types
    from werkzeug._compat import to_bytes
    from werkzeug._compat import wsgi_encoding_dance
    from werkzeug.datastructures import Headers
    from werkzeug.wrappers import Response
    def now_handler(event, context):
        payload = json.loads(event['body'])

        headers = Headers(payload.get('headers', {}))

        body = payload.get('body', '')
        if body != '':
            if payload.get('encoding') == 'base64':
                body = base64.b64decode(body)
        if isinstance(body, string_types):
            body = to_bytes(body, charset='utf-8')

        path = unquote(payload['path'])
        query = urlparse(path).query

        environ = {
            'CONTENT_LENGTH': str(len(body)),
            'CONTENT_TYPE': headers.get('content-type', ''),
            'PATH_INFO': path,
            'QUERY_STRING': query,
            'REMOTE_ADDR': headers.get(
                'x-forwarded-for', headers.get(
                    'x-real-ip', payload.get(
                        'true-client-ip', ''))),
            'REQUEST_METHOD': payload['method'],
            'SERVER_NAME': headers.get('host', 'lambda'),
            'SERVER_PORT': headers.get('x-forwarded-port', '80'),
            'SERVER_PROTOCOL': 'HTTP/1.1',
            'event': event,
            'context': context,
            'wsgi.errors': sys.stderr,
            'wsgi.input': BytesIO(body),
            'wsgi.multiprocess': False,
            'wsgi.multithread': False,
            'wsgi.run_once': False,
            'wsgi.url_scheme': headers.get('x-forwarded-proto', 'http'),
            'wsgi.version': (1, 0),
        }

        for key, value in environ.items():
            if isinstance(value, string_types) and key != 'QUERY_STRING':
                environ[key] = wsgi_encoding_dance(value)

        for key, value in headers.items():
            key = 'HTTP_' + key.upper().replace('-', '_')
            if key not in ('HTTP_CONTENT_TYPE', 'HTTP_CONTENT_LENGTH'):
                environ[key] = value

        response = Response.from_app(_now_imported, environ)

        return_dict = {
            'statusCode': response.status_code,
            'headers': dict(response.headers)
        }

        if response.data:
            return_dict['body'] = base64.b64encode(response.data).decode('utf-8')
            return_dict['encoding'] = 'base64'

        return return_dict

