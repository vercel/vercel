import sys
import base64
import json
import inspect
from importlib import util
from http.server import BaseHTTPRequestHandler
import socket
import os

# Import relative path https://docs.python.org/3/library/importlib.html#importing-a-source-file-directly
__vc_spec = util.spec_from_file_location("__VC_HANDLER_MODULE_NAME", "./__VC_HANDLER_ENTRYPOINT")
__vc_module = util.module_from_spec(__vc_spec)
sys.modules["__VC_HANDLER_MODULE_NAME"] = __vc_module
__vc_spec.loader.exec_module(__vc_module)
__vc_variables = dir(__vc_module)

_use_legacy_asyncio = sys.version_info < (3, 10)

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

if 'VERCEL_IPC_FD' in os.environ or 'VERCEL_IPC_PATH' in os.environ:
    from http.server import ThreadingHTTPServer
    import http
    import time
    import contextvars
    import functools
    import builtins
    import logging

    start_time = time.time()

    if 'VERCEL_IPC_FD' in os.environ:
        ipc_fd = int(os.getenv("VERCEL_IPC_FD", ""))
        sock = socket.socket(fileno=ipc_fd)
    else:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.connect(os.getenv("VERCEL_IPC_PATH", ""))

    send_message = lambda message: sock.sendall((json.dumps(message) + '\0').encode())
    storage = contextvars.ContextVar('storage', default=None)

    # Override urlopen from urllib3 (& requests) to send Request Metrics
    try:
        import urllib3
        from urllib.parse import urlparse

        def timed_request(func):
            fetchId = 0
            @functools.wraps(func)
            def wrapper(self, method, url, *args, **kwargs):
                nonlocal fetchId
                fetchId += 1
                start_time = int(time.time() * 1000)
                result = func(self, method, url, *args, **kwargs)
                elapsed_time = int(time.time() * 1000) - start_time
                parsed_url = urlparse(url)
                context = storage.get()
                if context is not None:
                    send_message({
                        "type": "metric",
                        "payload": {
                            "context": {
                                "invocationId": context['invocationId'],
                                "requestId": context['requestId'],
                            },
                            "type": "fetch-metric",
                            "payload": {
                                "pathname": parsed_url.path,
                                "search": parsed_url.query,
                                "start": start_time,
                                "duration": elapsed_time,
                                "host": parsed_url.hostname or self.host,
                                "statusCode": result.status,
                                "method": method,
                                "id": fetchId
                            }
                        }
                    })
                return result
            return wrapper
        urllib3.connectionpool.HTTPConnectionPool.urlopen = timed_request(urllib3.connectionpool.HTTPConnectionPool.urlopen)
    except:
        pass

    # Override sys.stdout and sys.stderr to map logs to the correct request
    class StreamWrapper:
        def __init__(self, stream, stream_name):
            self.stream = stream
            self.stream_name = stream_name

        def write(self, message):
            context = storage.get()
            if context is not None:
                send_message({
                    "type": "log",
                    "payload": {
                        "context": {
                            "invocationId": context['invocationId'],
                            "requestId": context['requestId'],
                        },
                        "message": base64.b64encode(message.encode()).decode(),
                        "stream": self.stream_name,
                    }
                })
            else:
                self.stream.write(message)

        def __getattr__(self, name):
            return getattr(self.stream, name)

    sys.stdout = StreamWrapper(sys.stdout, "stdout")
    sys.stderr = StreamWrapper(sys.stderr, "stderr")

    # Override the global print to log to stdout
    def print_wrapper(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            sys.stdout.write(' '.join(map(str, args)) + '\n')
        return wrapper
    builtins.print = print_wrapper(builtins.print)

    # Override logging to maps logs to the correct request
    def logging_wrapper(func, level="info"):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            context = storage.get()
            if context is not None:
                send_message({
                    "type": "log",
                    "payload": {
                        "context": {
                            "invocationId": context['invocationId'],
                            "requestId": context['requestId'],
                        },
                        "message": base64.b64encode(f"{args[0]}".encode()).decode(),
                        "level": level,
                    }
                })
            else:
                func(*args, **kwargs)
        return wrapper

    logging.basicConfig(level=logging.INFO)
    logging.debug = logging_wrapper(logging.debug)
    logging.info = logging_wrapper(logging.info)
    logging.warning = logging_wrapper(logging.warning, "warn")
    logging.error = logging_wrapper(logging.error, "error")
    logging.critical = logging_wrapper(logging.critical, "error")

    class BaseHandler(BaseHTTPRequestHandler):
        # Re-implementation of BaseHTTPRequestHandler's log_message method to
        # log to stdout instead of stderr.
        def log_message(self, format, *args):
            message = format % args
            sys.stdout.write("%s - - [%s] %s\n" %
                             (self.address_string(),
                              self.log_date_time_string(),
                              message.translate(self._control_char_table)))

        # Re-implementation of BaseHTTPRequestHandler's handle_one_request method
        # to send the end message after the response is fully sent.
        def handle_one_request(self):
            self.raw_requestline = self.rfile.readline(65537)
            if not self.raw_requestline:
                self.close_connection = True
                return
            if not self.parse_request():
                return

            invocationId = self.headers.get('x-vercel-internal-invocation-id')
            requestId = int(self.headers.get('x-vercel-internal-request-id'))
            del self.headers['x-vercel-internal-invocation-id']
            del self.headers['x-vercel-internal-request-id']
            del self.headers['x-vercel-internal-span-id']
            del self.headers['x-vercel-internal-trace-id']

            send_message({
                "type": "handler-started",
                "payload": {
                    "handlerStartedAt": int(time.time() * 1000),
                    "context": {
                        "invocationId": invocationId,
                        "requestId": requestId,
                    }
                }
            })

            token = storage.set({
                "invocationId": invocationId,
                "requestId": requestId,
            })

            try:
                self.handle_request()
            finally:
                storage.reset(token)
                send_message({
                    "type": "end",
                    "payload": {
                        "context": {
                            "invocationId": invocationId,
                            "requestId": requestId,
                        }
                    }
                })

    if 'handler' in __vc_variables or 'Handler' in __vc_variables:
        base = __vc_module.handler if ('handler' in __vc_variables) else  __vc_module.Handler
        if not issubclass(base, BaseHTTPRequestHandler):
            print('Handler must inherit from BaseHTTPRequestHandler')
            print('See the docs: https://vercel.com/docs/functions/serverless-functions/runtimes/python')
            exit(1)

        class Handler(BaseHandler, base):
            def handle_request(self):
                mname = 'do_' + self.command
                if not hasattr(self, mname):
                    self.send_error(
                        http.HTTPStatus.NOT_IMPLEMENTED,
                        "Unsupported method (%r)" % self.command)
                    return
                method = getattr(self, mname)
                method()
                self.wfile.flush()
    elif 'app' in __vc_variables:
        if (
            not inspect.iscoroutinefunction(__vc_module.app) and
            not inspect.iscoroutinefunction(__vc_module.app.__call__)
        ):
            from io import BytesIO

            string_types = (str,)
            app = __vc_module.app

            def wsgi_encoding_dance(s, charset="utf-8", errors="replace"):
                if isinstance(s, str):
                    s = s.encode(charset)
                return s.decode("latin1", errors)

            class Handler(BaseHandler):
                def handle_request(self):
                    # Prepare WSGI environment
                    if '?' in self.path:
                        path, query = self.path.split('?', 1)
                    else:
                        path, query = self.path, ''
                    content_length = int(self.headers.get('Content-Length', 0))
                    env = {
                        'CONTENT_LENGTH': str(content_length),
                        'CONTENT_TYPE': self.headers.get('content-type', ''),
                        'PATH_INFO': path,
                        'QUERY_STRING': query,
                        'REMOTE_ADDR': self.headers.get(
                            'x-forwarded-for', self.headers.get(
                                'x-real-ip')),
                        'REQUEST_METHOD': self.command,
                        'SERVER_NAME': self.headers.get('host', 'lambda'),
                        'SERVER_PORT': self.headers.get('x-forwarded-port', '80'),
                        'SERVER_PROTOCOL': 'HTTP/1.1',
                        'wsgi.errors': sys.stderr,
                        'wsgi.input': BytesIO(self.rfile.read(content_length)),
                        'wsgi.multiprocess': False,
                        'wsgi.multithread': False,
                        'wsgi.run_once': False,
                        'wsgi.url_scheme': self.headers.get('x-forwarded-proto', 'http'),
                        'wsgi.version': (1, 0),
                    }
                    for key, value in env.items():
                        if isinstance(value, string_types):
                            env[key] = wsgi_encoding_dance(value)
                    for k, v in self.headers.items():
                        env['HTTP_' + k.replace('-', '_').upper()] = v
                    # Response body
                    body = BytesIO()

                    def start_response(status, headers, exc_info=None):
                        self.send_response(int(status.split(' ')[0]))
                        for name, value in headers:
                            self.send_header(name, value)
                        self.end_headers()
                        return body.write

                    # Call the application
                    response = app(env, start_response)
                    try:
                        for data in response:
                            if data:
                                body.write(data)
                    finally:
                        if hasattr(response, 'close'):
                            response.close()
                    body = body.getvalue()
                    self.wfile.write(body)
                    self.wfile.flush()
        else:
            from urllib.parse import urlparse
            from io import BytesIO
            import asyncio

            app = __vc_module.app

            class Handler(BaseHandler):
                def handle_request(self):
                    # Prepare ASGI scope
                    url = urlparse(self.path)
                    headers_encoded = []
                    for k, v in self.headers.items():
                        # Cope with repeated headers in the encoding.
                        if isinstance(v, list):
                            headers_encoded.append([k.lower().encode(), [i.encode() for i in v]])
                        else:
                            headers_encoded.append([k.lower().encode(), v.encode()])
                    scope = {
                        'server': (self.headers.get('host', 'lambda'), self.headers.get('x-forwarded-port', 80)),
                        'client': (self.headers.get(
                            'x-forwarded-for', self.headers.get(
                                'x-real-ip')), 0),
                        'scheme': self.headers.get('x-forwarded-proto', 'http'),
                        'root_path': '',
                        'query_string': url.query.encode(),
                        'headers': headers_encoded,
                        'type': 'http',
                        'http_version': '1.1',
                        'method': self.command,
                        'path': url.path,
                        'raw_path': url.path.encode(),
                    }

                    if 'content-length' in self.headers:
                        content_length = int(self.headers['content-length'])
                        body = self.rfile.read(content_length)
                    else:
                        body = b''

                    if _use_legacy_asyncio:
                        loop = asyncio.new_event_loop()
                        app_queue = asyncio.Queue(loop=loop)
                    else:
                        app_queue = asyncio.Queue()
                    app_queue.put_nowait({'type': 'http.request', 'body': body, 'more_body': False})

                    # Prepare ASGI receive function
                    async def receive():
                        message = await app_queue.get()
                        return message

                    # Prepare ASGI send function
                    response_started = False
                    async def send(event):
                        nonlocal response_started
                        if event['type'] == 'http.response.start':
                            self.send_response(event['status'])
                            if 'headers' in event:
                                for name, value in event['headers']:
                                    self.send_header(name.decode(), value.decode())
                            self.end_headers()
                            response_started = True
                        elif event['type'] == 'http.response.body':
                            self.wfile.write(event['body'])
                            if not event.get('more_body', False):
                                self.wfile.flush()

                    # Run the ASGI application
                    asgi_instance = app(scope, receive, send)
                    if _use_legacy_asyncio:
                        asgi_task = loop.create_task(asgi_instance)
                        loop.run_until_complete(asgi_task)
                    else:
                        asyncio.run(asgi_instance)

    if 'Handler' in locals():
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        send_message({
            "type": "server-started",
            "payload": {
                "initDuration": int((time.time() - start_time) * 1000),
                "httpPort": server.server_address[1],
            }
        })
        server.serve_forever()

    print('Missing variable `handler` or `app` in file "__VC_HANDLER_ENTRYPOINT".')
    print('See the docs: https://vercel.com/docs/functions/serverless-functions/runtimes/python')
    exit(1)

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
        # https://github.com/erm/mangum/blob/b4d21c8f5e304a3e17b88bc9fa345106acc50ad7/mangum/__init__.py
        # https://github.com/erm/mangum/blob/b4d21c8f5e304a3e17b88bc9fa345106acc50ad7/LICENSE
        import asyncio
        import enum
        from urllib.parse import urlparse
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
                if _use_legacy_asyncio:
                    loop = asyncio.new_event_loop()
                    self.app_queue = asyncio.Queue(loop=loop)
                else:
                    self.app_queue = asyncio.Queue()
                self.put_message({'type': 'http.request', 'body': body, 'more_body': False})

                asgi_instance = app(self.scope, self.receive, self.send)

                if _use_legacy_asyncio:
                    asgi_task = loop.create_task(asgi_instance)
                    loop.run_until_complete(asgi_task)
                else:
                    asyncio.run(self.run_asgi_instance(asgi_instance))
                return self.response

            async def run_asgi_instance(self, asgi_instance):
                await asgi_instance

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

            asgi_cycle = ASGICycle(scope)
            response = asgi_cycle(__vc_module.app, body)
            return response

else:
    print('Missing variable `handler` or `app` in file "__VC_HANDLER_ENTRYPOINT".')
    print('See the docs: https://vercel.com/docs/functions/serverless-functions/runtimes/python')
    exit(1)
