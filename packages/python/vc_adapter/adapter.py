import base64
import json
import atexit
import sys
import time
import asyncio
import threading
import os
from io import BytesIO
from http.server import HTTPServer, BaseHTTPRequestHandler
import http
import logging
import _thread
import socket as _socket
from typing import Any, Callable
from contextvars import ContextVar

from .types import ASGI, WSGI
from .protocols.http import HTTPCycle
from .protocols.lifespan import LifespanCycle
from .utils import (
    init_logging,
    install_urllib3_metrics,
    attach_stream_wrappers,
    wrap_print,
    decode_body_from_payload,
    asgi_headers_to_multi_value,
    build_asgi_scope_from_payload,
    send_message,
    get_asyncio_queue,
    is_asgi_app,
    format_headers,
)


def _handle_asgi(app: ASGI, payload: dict) -> dict:
    _ensure_lifespan(app)
    body = decode_body_from_payload(payload)
    scope = build_asgi_scope_from_payload(payload)

    # Prefer executing the entire ASGI exchange on the lifespan loop to avoid
    # cross-thread event loop/queue interactions.
    loop = _LIFESPAN_LOOP if (_LIFESPAN_CYCLE is not None and _LIFESPAN_LOOP is not None) else None

    async def _runner() -> dict:
        cycle = HTTPCycle(scope, body)
        await cycle.run(app)
        return {
            "status": getattr(cycle, 'status', 200),
            "headers": getattr(cycle, 'headers', []),
            "body": getattr(cycle, 'body', b''),
        }

    if loop is not None:
        response = asyncio.run_coroutine_threadsafe(_runner(), loop).result()
    else:
        # Fallback: no background lifespan loop available; run in a fresh loop
        response = asyncio.run(_runner())

    # Always base64-encode for ASGI to preserve binary transparency (parity with existing shim)
    body_bytes = response.get('body') or b''
    out = {
        'statusCode': int(response.get('status', 200)),
        'headers': asgi_headers_to_multi_value(response.get('headers', [])),
    }
    if body_bytes:
        out['body'] = base64.b64encode(body_bytes).decode('utf-8')
        out['encoding'] = 'base64'
    return out


def _handle_wsgi(app: WSGI, payload: dict, event: dict, context: dict) -> dict:
    # Import lazily to avoid penalizing ASGI cold starts
    from werkzeug.datastructures import Headers
    from werkzeug.wrappers import Response as WsgiResponse
    from urllib.parse import urlparse as _urlparse

    headers = Headers(payload.get('headers', {}))

    body = payload.get('body', '')
    if body != '':
        if payload.get('encoding') == 'base64':
            try:
                body = base64.b64decode(body)
            except Exception:
                body = body if isinstance(body, (bytes, bytearray)) else str(body).encode()
    if isinstance(body, str):
        body = body.encode('utf-8')

    url = _urlparse(payload['path'])
    query = url.query
    path = url.path

    def _wsgi_encoding_dance(s, charset="utf-8", errors="replace"):
        if isinstance(s, str):
            s = s.encode(charset)
        return s.decode("latin1", errors)

    environ = {
        'CONTENT_LENGTH': str(len(body or b'')),
        'CONTENT_TYPE': headers.get('content-type', ''),
        'PATH_INFO': path,
        'QUERY_STRING': query,
        'REMOTE_ADDR': headers.get('x-forwarded-for', headers.get('x-real-ip', payload.get('true-client-ip', ''))),
        'REQUEST_METHOD': payload['method'],
        'SERVER_NAME': headers.get('host', 'lambda'),
        'SERVER_PORT': headers.get('x-forwarded-port', '80'),
        'SERVER_PROTOCOL': 'HTTP/1.1',
        'event': event,
        'context': context,
        'wsgi.errors': sys.stderr,
        'wsgi.input': BytesIO(body or b''),
        'wsgi.multiprocess': False,
        'wsgi.multithread': False,
        'wsgi.run_once': False,
        'wsgi.url_scheme': headers.get('x-forwarded-proto', 'http'),
        'wsgi.version': (1, 0),
    }

    for key, value in list(environ.items()):
        if isinstance(value, str):
            environ[key] = _wsgi_encoding_dance(value)

    for key, value in headers.items():
        key_up = 'HTTP_' + key.upper().replace('-', '_')
        if key_up not in ('HTTP_CONTENT_TYPE', 'HTTP_CONTENT_LENGTH'):
            environ[key_up] = value

    response = WsgiResponse.from_app(app, environ)

    # Convert headers to multi-value dict
    headers_dict = {}
    for k, v in response.headers.items():
        headers_dict.setdefault(k, []).append(v)

    out = {
        'statusCode': response.status_code,
        'headers': headers_dict,
    }
    if response.data:
        out['body'] = base64.b64encode(bytes(response.data)).decode('utf-8')
        out['encoding'] = 'base64'
    try:
        logging.getLogger("http").info("%s %s %s", payload.get('method'), url.path, response.status_code)
    except Exception:
        pass
    return out


def create_vc_handler_for_app(app: ASGI | WSGI) -> Callable[[dict, dict], dict]:
    """
    Return a Vercel-compatible handler callable for the given app.
    Supports ASGI (async callable) and WSGI (sync callable) apps.
    The handler expects an AWS Lambda-style (Vercel-internal) event with JSON body.
    """
    is_asgi = is_asgi_app(app)
    print('using Asynchronous Server Gateway Interface (ASGI)' if is_asgi else 'using Web Server Gateway Interface (WSGI)')

    if is_asgi:
        _ensure_lifespan(app)

    # Lazy-initialize per-request logging context integration for serverless
    storage: ContextVar | None = None

    def _ensure_logging_and_metrics(payload: dict) -> tuple[ContextVar, Any]:
        nonlocal storage
        if storage is None:
            storage = ContextVar('storage', default=None)
            # Ensure INFO-level logging so request path/status logs from HTTPCycle
            # are emitted consistently in all environments (dev and serverless).
            try:
                init_logging(storage)
            except Exception:
                pass
            # Extra instrumentation is only useful in dev when IPC is available.
            if os.getenv('VERCEL_IPC_PATH'):
                try:
                    install_urllib3_metrics(storage)
                except Exception:
                    pass
                try:
                    attach_stream_wrappers(storage)
                except Exception:
                    pass
                try:
                    wrap_print()
                except Exception:
                    pass
        token = storage.set({
            'invocationId': payload.get('invocationId') or payload.get('invocation_id') or '',
            'requestId': payload.get('requestId') or payload.get('request_id') or 0,
        })
        return storage, token

    def _handler(event: dict, context: dict) -> dict:
        payload = json.loads(event['body']) if isinstance(event.get('body'), (str, bytes)) else (event.get('body') or {})
        storage, token = _ensure_logging_and_metrics(payload)
        if is_asgi:
            try:
                return _handle_asgi(app, payload)
            finally:
                try:
                    storage.reset(token)
                except Exception:
                    pass
        else:
            try:
                return _handle_wsgi(app, payload, event, context)
            finally:
                try:
                    storage.reset(token)
                except Exception:
                    pass

    return _handler


def create_vc_handler_for_request_handler(base: type[BaseHTTPRequestHandler]) -> Callable[[dict, dict], dict]:
    """
    Return a Vercel-compatible handler callable for a BaseHTTPRequestHandler subclass.
    Spins up a local HTTPServer once, and forwards each invocation to it.
    """
    server = HTTPServer(('127.0.0.1', 0), base)
    port = server.server_address[1]

    def _handler(event: dict, context: dict) -> dict:
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
        except (http.client.HTTPException, _socket.error) as ex:
            print("Request Error: %s" % ex)
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

    return _handler


_LIFESPAN_CYCLE = None
_LIFESPAN_READY = False
_LIFESPAN_LOOP = None
_LIFESPAN_THREAD = None
_LIFESPAN_INIT_LOCK = threading.Lock()


def _ensure_lifespan(app: ASGI):
    global _LIFESPAN_CYCLE, _LIFESPAN_READY, _LIFESPAN_LOOP, _LIFESPAN_THREAD
    if _LIFESPAN_READY:
        return

    # Guard against concurrent initialization attempts
    with _LIFESPAN_INIT_LOCK:
        if _LIFESPAN_READY:
            return

        ready_event = threading.Event()
        error_holder: dict[str, BaseException | None] = {"exc": None}

        def _runner():
            global _LIFESPAN_CYCLE, _LIFESPAN_LOOP
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                cycle = LifespanCycle(app, 'auto')
                _LIFESPAN_LOOP = loop
                _LIFESPAN_CYCLE = cycle
                # Start the lifespan task and keep the loop running for the process lifetime
                loop.create_task(cycle.run())
                ready_event.set()
                loop.run_forever()
            except BaseException as exc:
                error_holder["exc"] = exc
                try:
                    ready_event.set()
                except Exception:
                    pass

        try:
            t = threading.Thread(target=_runner, name="vercel-asgi-lifespan", daemon=True)
            t.start()
            _LIFESPAN_THREAD = t
            # Wait until loop and cycle are ready
            ready_event.wait()

            # If thread failed during setup, mark as ready (unsupported) and bail
            if error_holder["exc"] is not None:
                _LIFESPAN_CYCLE = None
                _LIFESPAN_LOOP = None
                _LIFESPAN_THREAD = None
                _LIFESPAN_READY = True
                return

            # Perform startup on the running loop
            if _LIFESPAN_CYCLE is not None and _LIFESPAN_LOOP is not None:
                fut = asyncio.run_coroutine_threadsafe(_LIFESPAN_CYCLE.startup(), _LIFESPAN_LOOP)
                try:
                    fut.result()
                except Exception:
                    # Startup failed or unsupported lifespan; tear down background loop
                    try:
                        _LIFESPAN_LOOP.call_soon_threadsafe(_LIFESPAN_LOOP.stop)
                    except Exception:
                        pass
                    try:
                        if _LIFESPAN_THREAD is not None:
                            _LIFESPAN_THREAD.join(timeout=2)
                    except Exception:
                        pass
                    _LIFESPAN_CYCLE = None
                    _LIFESPAN_LOOP = None
                    _LIFESPAN_THREAD = None
                    _LIFESPAN_READY = True
                    return

            _LIFESPAN_READY = True

            def _shutdown():
                try:
                    if _LIFESPAN_CYCLE is not None and _LIFESPAN_LOOP is not None:
                        asyncio.run_coroutine_threadsafe(_LIFESPAN_CYCLE.shutdown(), _LIFESPAN_LOOP).result(timeout=2)
                except Exception:
                    pass
                try:
                    if _LIFESPAN_LOOP is not None:
                        _LIFESPAN_LOOP.call_soon_threadsafe(_LIFESPAN_LOOP.stop)
                except Exception:
                    pass
                try:
                    if _LIFESPAN_THREAD is not None:
                        _LIFESPAN_THREAD.join(timeout=2)
                except Exception:
                    pass

            try:
                atexit.register(_shutdown)
            except Exception:
                pass
        except Exception:
            # If app doesn't support lifespan or initialization fails, continue without it
            _LIFESPAN_CYCLE = None
            _LIFESPAN_LOOP = None
            _LIFESPAN_THREAD = None
            _LIFESPAN_READY = True


class BaseDevHandler(BaseHTTPRequestHandler):
    """
    Base dev handler that integrates IPC lifecycle messages and request-scoped
    logging/metrics context using a ContextVar provided via `BaseDevHandler.storage`.

    Subclasses must implement `handle_request(self)` to write the actual response.
    """
    storage: ContextVar | None = None

    def log_message(self, format, *args):  # type: ignore[override]
        message = format % args
        sys.stdout.write("%s - - [%s] %s\n" % (
            self.address_string(),
            self.log_date_time_string(),
            message.translate(self._control_char_table),  # type: ignore[attr-defined]
        ))

    def handle_one_request(self):  # type: ignore[override]
        self.raw_requestline = self.rfile.readline(65537)
        if not self.raw_requestline:
            self.close_connection = True
            return
        if not self.parse_request():
            return

        if self.path == '/_vercel/ping':
            self.send_response(200)
            self.end_headers()
            return

        invocationId = self.headers.get('x-vercel-internal-invocation-id')
        requestId = int(self.headers.get('x-vercel-internal-request-id'))
        for key in (
            'x-vercel-internal-invocation-id',
            'x-vercel-internal-request-id',
            'x-vercel-internal-span-id',
            'x-vercel-internal-trace-id',
        ):
            try:
                del self.headers[key]
            except Exception:
                pass

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

        token = None
        try:
            if BaseDevHandler.storage is not None:
                token = BaseDevHandler.storage.set({
                    "invocationId": invocationId,
                    "requestId": requestId,
                })
            self.handle_request()
        finally:
            if BaseDevHandler.storage is not None and token is not None:
                try:
                    BaseDevHandler.storage.reset(token)
                except Exception:
                    pass
            send_message({
                "type": "end",
                "payload": {
                    "context": {
                        "invocationId": invocationId,
                        "requestId": requestId,
                    }
                }
            })

    # To be provided by subclasses or composed handlers
    def handle_request(self):  # pragma: no cover
        raise NotImplementedError

    @classmethod
    def with_storage(cls, storage: ContextVar) -> type["BaseDevHandler"]:
        """Return a subclass of this handler with storage bound for request scope."""
        class _Bound(cls):
            pass
        _Bound.storage = storage
        return _Bound


def serve_dev_app(app: ASGI | WSGI, BaseHandlerClass: type[BaseDevHandler]) -> None:
    """
    Start a local dev HTTP server for a user-provided app (WSGI or ASGI),
    preserving Vercel dev semantics: streaming, request-scoped logging/metrics,
    and best-effort ASGI lifespan.
    Expects BaseHandlerClass to provide handle_one_request with IPC messages and
    storage tokenization.
    """
    from urllib.parse import urlparse
    from http.server import ThreadingHTTPServer

    is_asgi = is_asgi_app(app)

    _lifespan = None
    if is_asgi:
        try:
            _lifespan = LifespanCycle(app, 'auto')
            _lifespan.loop.create_task(_lifespan.run())
            _lifespan.loop.run_until_complete(_lifespan.startup())
            atexit.register(lambda: (_lifespan and _lifespan.loop.run_until_complete(_lifespan.shutdown())))
        except Exception:
            _lifespan = None

    start_time = time.time()

    class Handler(BaseHandlerClass):
        def handle_request(self):
            # WSGI path
            if not is_asgi:
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
                    'REMOTE_ADDR': self.headers.get('x-forwarded-for', self.headers.get('x-real-ip')),
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
                for k, v in self.headers.items():
                    env['HTTP_' + k.replace('-', '_').upper()] = v

                def start_response(status, headers, exc_info=None):
                    self.send_response(int(status.split(' ')[0]))
                    for name, value in headers:
                        self.send_header(name, value)
                    self.end_headers()
                    return self.wfile.write

                response = app(env, start_response)
                try:
                    for data in response:
                        if data:
                            self.wfile.write(data)
                            self.wfile.flush()
                finally:
                    if hasattr(response, 'close'):
                        response.close()
                return

            # ASGI path with streaming & background tasks
            url = urlparse(self.path)
            headers_encoded = []
            for k, v in self.headers.items():
                if isinstance(v, list):
                    headers_encoded.append([k.lower().encode(), [i.encode() for i in v]])
                else:
                    headers_encoded.append([k.lower().encode(), v.encode()])

            scope = {
                'server': (self.headers.get('host', 'lambda'), self.headers.get('x-forwarded-port', 80)),
                'client': (self.headers.get('x-forwarded-for', self.headers.get('x-real-ip')), 0),
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

            response_done = threading.Event()
            storage_var: ContextVar | None = getattr(BaseHandlerClass, 'storage', None)
            request_context = storage_var.get() if storage_var is not None else None

            def run_asgi():
                if request_context is not None:
                    token = storage_var.set(request_context)
                else:
                    token = None
                response_started = False
                try:
                    async def runner():
                        app_queue = get_asyncio_queue()
                        await app_queue.put({'type': 'http.request', 'body': body, 'more_body': False})

                        async def receive():
                            return await app_queue.get()

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
                                body_bytes = event.get('body', b'') or b''
                                if body_bytes:
                                    self.wfile.write(body_bytes)
                                if not event.get('more_body', False):
                                    try:
                                        self.wfile.flush()
                                    finally:
                                        response_done.set()
                                        try:
                                            app_queue.put_nowait({'type': 'http.disconnect'})
                                        except Exception:
                                            pass

                        asgi_instance = app(scope, receive, send)
                        await asgi_instance

                    asyncio.run(runner())
                except Exception:
                    try:
                        if not response_started:
                            self.send_response(500)
                            self.end_headers()
                        try:
                            self.wfile.flush()
                        except Exception:
                            pass
                    except Exception:
                        pass
                finally:
                    try:
                        response_done.set()
                    except Exception:
                        pass
                    if token is not None and storage_var is not None:
                        storage_var.reset(token)

            t = threading.Thread(target=run_asgi, daemon=True)
            t.start()
            response_done.wait()

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    send_message({
        "type": "server-started",
        "payload": {
            "initDuration": int((time.time() - start_time) * 1000),
            "httpPort": server.server_address[1],
        }
    })
    server.serve_forever()


def serve_dev_handler(base: type[BaseHTTPRequestHandler], BaseHandlerClass: type[BaseDevHandler]) -> None:
    from http.server import ThreadingHTTPServer

    start_time = time.time()

    class Handler(BaseHandlerClass, base):
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

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    send_message({
        "type": "server-started",
        "payload": {
            "initDuration": int((time.time() - start_time) * 1000),
            "httpPort": server.server_address[1],
        }
    })
    server.serve_forever()


__all__ = [
    'create_vc_handler_for_app',
    'create_vc_handler_for_request_handler',
    'serve_dev_app',
]
