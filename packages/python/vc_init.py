import sys
import base64
import json
import inspect
from importlib import util
from http.server import BaseHTTPRequestHandler
import socket

# Import relative path https://docs.python.org/3/library/importlib.html#importing-a-source-file-directly
__vc_spec = util.spec_from_file_location("__VC_HANDLER_MODULE_NAME", "./__VC_HANDLER_ENTRYPOINT")
__vc_module = util.module_from_spec(__vc_spec)
sys.modules["__VC_HANDLER_MODULE_NAME"] = __vc_module
__vc_spec.loader.exec_module(__vc_module)
__vc_variables = dir(__vc_module)

def format_headers(headers, decode=False):
    keyToList = {}
    for key, value in headers.items():
        if decode and 'decode' in dir(key) and 'decode' in dir(value):
            key = key.decode()
            value = value.decode()
        if key not in keyToList:
            keyToList[key] = []
        keyToList[key].append(value)
    return keyToList


if 'handler' in __vc_variables or 'Handler' in __vc_variables:
    base = __vc_module.handler if ('handler' in __vc_variables) else  __vc_module.Handler
    if not issubclass(base, BaseHTTPRequestHandler):
        print('Handler must inherit from BaseHTTPRequestHandler')
        print('See the docs: https://vercel.com/docs/functions/serverless-functions/runtimes/python')
        exit(1)

    print('using HTTP Handler')
    from http.server import HTTPServer
    import http
    import _thread

    server = HTTPServer(('127.0.0.1', 0), base)
    port = server.server_address[1]

    def vc_handler(event, context):
        _thread.start_new_thread(server.handle_request, ())

        payload = json.loads(event['body'])
        path = payload['path']
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
        conn = http.client.HTTPConnection('127.0.0.1', port)
        try:
            conn.request(method, path, headers=headers, body=request_body)
        except (http.client.HTTPException, socket.error) as ex:
            print ("Request Error: %s" % ex)
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

elif 'app' in __vc_variables:
    if (
        not inspect.iscoroutinefunction(__vc_module.app) and
        not inspect.iscoroutinefunction(__vc_module.app.__call__)
    ):
        print('using Web Server Gateway Interface (WSGI)')
        from io import BytesIO
        from urllib.parse import urlparse
        from werkzeug.datastructures import Headers
        from werkzeug.wrappers import Response

        string_types = (str,)

        def to_bytes(x, charset=sys.getdefaultencoding(), errors="strict"):
            if x is None:
                return None
            if isinstance(x, (bytes, bytearray, memoryview)):
                return bytes(x)
            if isinstance(x, str):
                return x.encode(charset, errors)
            raise TypeError("Expected bytes")

        def wsgi_encoding_dance(s, charset="utf-8", errors="replace"):
            if isinstance(s, str):
                s = s.encode(charset)
            return s.decode("latin1", errors)

        def vc_handler(event, context):
            payload = json.loads(event['body'])

            headers = Headers(payload.get('headers', {}))

            body = payload.get('body', '')
            if body != '':
                if payload.get('encoding') == 'base64':
                    body = base64.b64decode(body)
            if isinstance(body, string_types):
                body = to_bytes(body, charset='utf-8')

            url = urlparse(payload['path'])
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

            response = Response.from_app(__vc_module.app, environ)

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
        # https://github.com/jordaneremieff/mangum/blob/6086c268f32571c01f18e20875430db14a0570bc/mangum/protocols/http.py
        # https://github.com/jordaneremieff/mangum/blob/6086c268f32571c01f18e20875430db14a0570bc/mangum/types.py
        # https://github.com/jordaneremieff/mangum/blob/6086c268f32571c01f18e20875430db14a0570bc/mangum/exceptions.py
        # https://github.com/jordaneremieff/mangum/blob/6086c268f32571c01f18e20875430db14a0570bc/LICENSE
        import asyncio
        import enum
        from urllib.parse import urlparse
        from werkzeug.datastructures import Headers
        from io import BytesIO
        from typing import Any, Awaitable, Callable, MutableMapping, Protocol, TypedDict

        Message = MutableMapping[str, Any]
        Scope = MutableMapping[str, Any]
        Receive = Callable[[], Awaitable[Message]]
        Send = Callable[[Message], Awaitable[None]]

        class UnexpectedMessage(Exception):
            """Raise when an unexpected message type is received during an ASGI cycle."""

        class ASGI(Protocol):
            async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
                ...

        class Response(TypedDict):
            status: int
            headers: Headers
            body: bytes

        class HTTPCycleState(enum.Enum):
            REQUEST = enum.auto()
            RESPONSE = enum.auto()
            COMPLETE = enum.auto()

        class HTTPCycle:
            def __init__(self, scope: Scope, body: bytes) -> None:
                self.scope = scope
                self.buffer = BytesIO()
                self.state = HTTPCycleState.REQUEST
                self.app_queue: asyncio.Queue[Message] = asyncio.Queue()
                self.app_queue.put_nowait(
                    {
                        "type": "http.request",
                        "body": body,
                        "more_body": False,
                    }
                )

            def __call__(self, app: ASGI) -> Response:
                asgi_instance = self.run(app)
                loop = asyncio.get_event_loop()
                asgi_task = loop.create_task(asgi_instance)
                loop.run_until_complete(asgi_task)

                return {
                    "status": self.status,
                    "headers": self.headers,
                    "body": self.body,
                }

            async def run(self, app: ASGI) -> None:
                try:
                    await app(self.scope, self.receive, self.send)
                except BaseException:
                    print("Exception: An error occurred running the ASGI application.")
                    if self.state is HTTPCycleState.REQUEST:
                        await self.send(
                            {
                                "type": "http.response.start",
                                "status": 500,
                                "headers": [[b"content-type", b"text/plain; charset=utf-8"]],
                            }
                        )
                        await self.send(
                            {
                                "type": "http.response.body",
                                "body": b"Internal Server Error",
                                "more_body": False,
                            }
                        )
                    elif self.state is not HTTPCycleState.COMPLETE:
                        self.status = 500
                        self.body = b"Internal Server Error"
                        self.headers = [[b"content-type", b"text/plain; charset=utf-8"]]

            async def receive(self) -> Message:
                return await self.app_queue.get()  # pragma: no cover

            async def send(self, message: Message) -> None:
                if (
                    self.state is HTTPCycleState.REQUEST
                    and message["type"] == "http.response.start"
                ):
                    self.status = message["status"]
                    self.headers = message.get("headers", [])
                    self.state = HTTPCycleState.RESPONSE
                elif (
                    self.state is HTTPCycleState.RESPONSE
                    and message["type"] == "http.response.body"
                ):
                    body = message.get("body", b"")
                    more_body = message.get("more_body", False)
                    self.buffer.write(body)
                    if not more_body:
                        self.body = self.buffer.getvalue()
                        self.buffer.close()

                        self.state = HTTPCycleState.COMPLETE
                        await self.app_queue.put({"type": "http.disconnect"})

                        print(
                            "%s %s %s"
                            % (self.scope["method"], self.scope["path"], self.status)
                        )
                else:
                    raise UnexpectedMessage(f"Unexpected {message['type']}")

        def vc_handler(event, context):
            payload = json.loads(event['body'])

            headers = payload.get('headers', {})

            body = payload.get('body', b'')
            if payload.get('encoding') == 'base64':
                body = base64.b64decode(body)
            elif not isinstance(body, bytes):
                body = body.encode()

            url = urlparse(payload['path'])
            query = url.query.encode()
            path = url.path

            headers_encoded = []
            for k, v in headers.items():
                # Cope with repeated headers in the encoding.
                if isinstance(v, list):
                    headers_encoded.append([k.lower().encode(), [i.encode() for i in v]])
                else:
                    headers_encoded.append([k.lower().encode(), v.encode()])

            scope = {
                'server': (headers.get('host', 'lambda'), headers.get('x-forwarded-port', 80)),
                'client': (headers.get(
                    'x-forwarded-for', headers.get(
                        'x-real-ip', payload.get(
                            'true-client-ip', ''))), 0),
                'scheme': headers.get('x-forwarded-proto', 'http'),
                'root_path': '',
                'query_string': query,
                'headers': headers_encoded,
                'type': 'http',
                'http_version': '1.1',
                'method': payload['method'],
                'path': path,
                'raw_path': path.encode(),
            }

            http_cycle = HTTPCycle(scope, body)
            response = http_cycle(__vc_module.app)

            return response

else:
    print('Missing variable `handler` or `app` in file "__VC_HANDLER_ENTRYPOINT".')
    print('See the docs: https://vercel.com/docs/functions/serverless-functions/runtimes/python')
    exit(1)
