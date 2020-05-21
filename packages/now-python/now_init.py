
import sys
import base64
import json
import inspect
from importlib import util
from http.server import BaseHTTPRequestHandler

# Import relative path https://docs.python.org/3/library/importlib.html#importing-a-source-file-directly
__now_spec = util.spec_from_file_location("__NOW_HANDLER_MODULE_NAME", "./__NOW_HANDLER_ENTRYPOINT")
__now_module = util.module_from_spec(__now_spec)
sys.modules["__NOW_HANDLER_MODULE_NAME"] = __now_module
__now_spec.loader.exec_module(__now_module)
__now_variables = dir(__now_module)


def format_headers(headers, decode=False):
    keyToList = {}
    for key, value in headers.items():
        if decode:
            key = key.decode()
            value = value.decode()
        if key not in keyToList:
            keyToList[key] = []
        keyToList[key].append(value)
    return keyToList


if 'handler' in __now_variables or 'Handler' in __now_variables:
    base = __now_module.handler if ('handler' in __now_variables) else  __now_module.Handler
    if not issubclass(base, BaseHTTPRequestHandler):
        print('Handler must inherit from BaseHTTPRequestHandler')
        print('See the docs https://vercel.com/docs/runtimes#advanced-usage/advanced-python-usage')
        exit(1)

    print('using HTTP Handler')
    from http.server import HTTPServer
    from urllib.parse import unquote
    import http
    import _thread

    server = HTTPServer(('', 0), base)
    port = server.server_address[1]

    def now_handler(event, context):
        _thread.start_new_thread(server.handle_request, ())

        payload = json.loads(event['body'])
        path = unquote(payload['path'])
        path = path.replace(' ', '%20')
        headers = payload['headers']
        method = payload['method']
        encoding = payload.get('encoding')
        body = payload.get('body')

        if (
            (body is not None and len(body) > 0) and
            (encoding is not None and encoding == 'base64')
        ):
            body = base64.b64decode(body)

        request_body = body.encode('utf-8') if isinstance(body, str) else body
        conn = http.client.HTTPConnection('0.0.0.0', port)
        conn.request(method, path, headers=headers, body=request_body)
        res = conn.getresponse()

        return_dict = {
            'statusCode': res.status,
            'headers': format_headers(res.headers),
        }

        data = res.read()

        try:
            return_dict['body'] = data.decode('utf-8')
        except UnicodeDecodeError:
            return_dict['body'] = base64.b64encode(data).decode('utf-8')
            return_dict['encoding'] = 'base64'

        return return_dict

elif 'app' in __now_variables:
    if (
        not inspect.iscoroutinefunction(__now_module.app) and
        not inspect.iscoroutinefunction(__now_module.app.__call__)
    ):
        print('using Web Server Gateway Interface (WSGI)')
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

            url = urlparse(unquote(payload['path']))
            query = url.query
            path = url.path

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
                if isinstance(value, string_types):
                    environ[key] = wsgi_encoding_dance(value)

            for key, value in headers.items():
                key = 'HTTP_' + key.upper().replace('-', '_')
                if key not in ('HTTP_CONTENT_TYPE', 'HTTP_CONTENT_LENGTH'):
                    environ[key] = value

            response = Response.from_app(__now_module.app, environ)

            return_dict = {
                'statusCode': response.status_code,
                'headers': format_headers(response.headers)
            }

            if response.data:
                return_dict['body'] = base64.b64encode(response.data).decode('utf-8')
                return_dict['encoding'] = 'base64'

            return return_dict
    else:
        print('using Asynchronous Server Gateway Interface (ASGI)')
        # Originally authored by Jordan Eremieff and included under MIT license:
        # https://github.com/erm/mangum/blob/b4d21c8f5e304a3e17b88bc9fa345106acc50ad7/mangum/__init__.py
        # https://github.com/erm/mangum/blob/b4d21c8f5e304a3e17b88bc9fa345106acc50ad7/LICENSE
        import asyncio
        import enum
        from urllib.parse import urlparse, unquote, urlencode
        from werkzeug.datastructures import Headers


        class ASGICycleState(enum.Enum):
            REQUEST = enum.auto()
            RESPONSE = enum.auto()


        class ASGICycle:
            def __init__(self, scope):
                self.scope = scope
                self.body = b''
                self.state = ASGICycleState.REQUEST
                self.app_queue = None
                self.response = {}

            def __call__(self, app, body):
                """
                Receives the application and any body included in the request, then builds the
                ASGI instance using the connection scope.
                Runs until the response is completely read from the application.
                """
                loop = asyncio.new_event_loop()
                self.app_queue = asyncio.Queue(loop=loop)
                self.put_message({'type': 'http.request', 'body': body, 'more_body': False})

                asgi_instance = app(self.scope, self.receive, self.send)

                asgi_task = loop.create_task(asgi_instance)
                loop.run_until_complete(asgi_task)
                return self.response

            def put_message(self, message):
                self.app_queue.put_nowait(message)

            async def receive(self):
                """
                Awaited by the application to receive messages in the queue.
                """
                message = await self.app_queue.get()
                return message

            async def send(self, message):
                """
                Awaited by the application to send messages to the current cycle instance.
                """
                message_type = message['type']

                if self.state is ASGICycleState.REQUEST:
                    if message_type != 'http.response.start':
                        raise RuntimeError(
                            f"Expected 'http.response.start', received: {message_type}"
                        )

                    status_code = message['status']
                    headers = Headers(message.get('headers', []))

                    self.on_request(headers, status_code)
                    self.state = ASGICycleState.RESPONSE

                elif self.state is ASGICycleState.RESPONSE:
                    if message_type != 'http.response.body':
                        raise RuntimeError(
                            f"Expected 'http.response.body', received: {message_type}"
                        )

                    body = message.get('body', b'')
                    more_body = message.get('more_body', False)

                    # The body must be completely read before returning the response.
                    self.body += body

                    if not more_body:
                        self.on_response()
                        self.put_message({'type': 'http.disconnect'})

            def on_request(self, headers, status_code):
                self.response['statusCode'] = status_code
                self.response['headers'] = format_headers(headers, decode=True)

            def on_response(self):
                if self.body:
                    self.response['body'] = base64.b64encode(self.body).decode('utf-8')
                    self.response['encoding'] = 'base64'

        def now_handler(event, context):
            payload = json.loads(event['body'])

            headers = payload.get('headers', {})

            body = payload.get('body', b'')
            if payload.get('encoding') == 'base64':
                body = base64.b64decode(body)
            elif not isinstance(body, bytes):
                body = body.encode()

            url = urlparse(unquote(payload['path']))
            query = url.query.encode()
            path = url.path

            scope = {
                'server': (headers.get('host', 'lambda'), headers.get('x-forwarded-port', 80)),
                'client': (headers.get(
                    'x-forwarded-for', headers.get(
                        'x-real-ip', payload.get(
                            'true-client-ip', ''))), 0),
                'scheme': headers.get('x-forwarded-proto', 'http'),
                'root_path': '',
                'query_string': query,
                'headers': [[k.lower().encode(), v.encode()] for k, v in headers.items()],
                'type': 'http',
                'http_version': '1.1',
                'method': payload['method'],
                'path': path,
                'raw_path': path.encode(),
            }

            asgi_cycle = ASGICycle(scope)
            response = asgi_cycle(__now_module.app, body)
            return response

else:
    print('Missing variable `handler` or `app` in file "__NOW_HANDLER_ENTRYPOINT".')
    print('See the docs https://vercel.com/docs/runtimes#advanced-usage/advanced-python-usage')
    exit(1)
