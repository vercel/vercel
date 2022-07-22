import sys
import base64
import json
import inspect
from importlib import util
from http.server import BaseHTTPRequestHandler

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
        print('See the docs https://vercel.com/docs/runtimes#advanced-usage/advanced-python-usage')
        exit(1)

    print('using HTTP Handler')
    from http.server import HTTPServer
    import http
    import _thread

    server = HTTPServer(('', 0), base)
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
        # https://github.com/erm/mangum/blob/07ce20a0e2f67c5c2593258a92c03fdc66d9edda/mangum/__init__.py
        # https://github.com/erm/mangum/blob/07ce20a0e2f67c5c2593258a92c03fdc66d9edda/LICENSE
        import asyncio
        import enum
        import logging
        from contextlib import ExitStack
        from urllib.parse import urlparse
        from werkzeug.datastructures import Headers

        def get_event_loop():
            try:
                return asyncio.get_running_loop()
            except:
                if sys.version_info < (3, 10):
                    return asyncio.get_event_loop()
                else:
                    return asyncio.get_event_loop_policy().get_event_loop()

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
                loop = get_event_loop()
                self.app_queue = asyncio.Queue()
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

        class LifespanFailure(Exception):
            """Raise when a lifespan failure event is sent by an application."""

        class LifespanUnsupported(Exception):
            """Raise when lifespan events are not supported by an application."""

        class UnexpectedMessage(Exception):
            """Raise when an unexpected message type is received during an ASGI cycle."""

        class LifespanCycleState(enum.Enum):
            """
            The state of the ASGI `lifespan` connection.
            * **CONNECTING** - Initial state. The ASGI application instance will be run with
            the connection scope containing the `lifespan` type.
            * **STARTUP** - The lifespan startup event has been pushed to the queue to be
            received by the application.
            * **SHUTDOWN** - The lifespan shutdown event has been pushed to the queue to be
            received by the application.
            * **FAILED** - A lifespan failure has been detected, and the connection will be
            closed with an error.
            * **UNSUPPORTED** - An application attempted to send a message before receiving
            the lifepan startup event. If the lifespan argument is "on", then the connection
            will be closed with an error.
            """

            CONNECTING = enum.auto()
            STARTUP = enum.auto()
            SHUTDOWN = enum.auto()
            FAILED = enum.auto()
            UNSUPPORTED = enum.auto()
        
        class Lifespan:

            def __init__(self, app):
                self.app = app
                self.state = LifespanCycleState.CONNECTING
                self.exception = None
                self.logger = logging.getLogger('lifespan')
                self.loop = get_event_loop()
                self.app_queue = asyncio.Queue()
                self.startup_event = asyncio.Event()
                self.shutdown_event = asyncio.Event()

            
            def __enter__(self) -> None:
                """Runs the event loop for application startup."""
                self.loop.create_task(self.run())
                self.loop.run_until_complete(self.startup())

            def __exit__(
                self,
                exc_type,
                exc_value,
                traceback,
            ) -> None:
                """Runs the event loop for application shutdown."""
                self.loop.run_until_complete(self.shutdown())
                
            async def run(self):
                """Calls the application with the `lifespan` connection scope."""
                try:
                    await self.app(
                        {"type": "lifespan", "asgi": {"spec_version": "2.0", "version": "3.0"}},
                        self.receive,
                        self.send,
                    )
                except LifespanUnsupported:
                    self.logger.info("ASGI 'lifespan' protocol appears unsupported.")
                except (LifespanFailure, UnexpectedMessage) as exc:
                    self.exception = exc
                except BaseException as exc:
                    self.logger.error("Exception in 'lifespan' protocol.", exc_info=exc)
                finally:
                    self.startup_event.set()
                    self.shutdown_event.set()

            async def send(self, message):
                """Awaited by the application to send ASGI `lifespan` events."""
                message_type = message["type"]

                if self.state is LifespanCycleState.CONNECTING:
                    # If a message is sent before the startup event is received by the
                    # application, then assume that lifespan is unsupported.
                    self.state = LifespanCycleState.UNSUPPORTED
                    raise LifespanUnsupported("Lifespan protocol appears unsupported.")

                if message_type not in (
                    "lifespan.startup.complete",
                    "lifespan.shutdown.complete",
                    "lifespan.startup.failed",
                    "lifespan.shutdown.failed",
                ):
                    self.state = LifespanCycleState.FAILED
                    raise UnexpectedMessage(f"Unexpected '{message_type}' event received.")

                if self.state is LifespanCycleState.STARTUP:
                    if message_type == "lifespan.startup.complete":
                        self.startup_event.set()
                    elif message_type == "lifespan.startup.failed":
                        self.state = LifespanCycleState.FAILED
                        self.startup_event.set()
                        message_value = message.get("message", "")
                        raise LifespanFailure(f"Lifespan startup failure. {message_value}")

                elif self.state is LifespanCycleState.SHUTDOWN:
                    if message_type == "lifespan.shutdown.complete":
                        self.shutdown_event.set()
                    elif message_type == "lifespan.shutdown.failed":
                        self.state = LifespanCycleState.FAILED
                        self.shutdown_event.set()
                        message_value = message.get("message", "")
                        raise LifespanFailure(f"Lifespan shutdown failure. {message_value}")

            async def receive(self):
                """Awaited by the application to receive ASGI `lifespan` events."""
                if self.state is LifespanCycleState.CONNECTING:

                    # Connection established. The next event returned by the queue will be
                    # `lifespan.startup` to inform the application that the connection is
                    # ready to receive lfiespan messages.
                    self.state = LifespanCycleState.STARTUP

                elif self.state is LifespanCycleState.STARTUP:

                    # Connection shutting down. The next event returned by the queue will be
                    # `lifespan.shutdown` to inform the application that the connection is now
                    # closing so that it may perform cleanup.
                    self.state = LifespanCycleState.SHUTDOWN

                return await self.app_queue.get()

            async def startup(self) -> None:
                """Pushes the `lifespan` startup event to the queue and handles errors."""
                await self.app_queue.put({"type": "lifespan.startup"})
                await self.startup_event.wait()
                if self.state is LifespanCycleState.FAILED:
                    raise LifespanFailure(self.exception)

                if not self.exception:
                    self.logger.info("Application startup complete.")
                else:
                    self.logger.info("Application startup failed.")

            async def shutdown(self) -> None:
                """Pushes the `lifespan` shutdown event to the queue and handles errors."""
                await self.app_queue.put({"type": "lifespan.shutdown"})
                await self.shutdown_event.wait()
                if self.state is LifespanCycleState.FAILED:
                    raise LifespanFailure(self.exception)
       
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

            with ExitStack() as stack:
                lifespan = Lifespan(__vc_module.app)
                stack.enter_context(lifespan)

                asgi_cycle = ASGICycle(scope)
                response = asgi_cycle(__vc_module.app, body)
                return response

else:
    print('Missing variable `handler` or `app` in file "__VC_HANDLER_ENTRYPOINT".')
    print('See the docs https://vercel.com/docs/runtimes#advanced-usage/advanced-python-usage')
    exit(1)
