import sys
import asyncio
import time
import socket
import os
import json
import functools
import base64
import site
from typing import Callable
from contextvars import ContextVar
import logging
from typing import TextIO
from urllib.parse import urlparse
import importlib
import inspect
import threading
import atexit

from .types import ASGI, WSGI


_use_legacy_asyncio = sys.version_info < (3, 10)


def format_headers(headers: dict[str, list[str]], decode: bool = False) -> dict[str, list[str]]:
    keyToList = {}
    for key, value in headers.items():
        if decode and "decode" in dir(key) and "decode" in dir(value):
            key = key.decode()
            value = value.decode()
        if key not in keyToList:
            keyToList[key] = []
        keyToList[key].append(value)
    return keyToList


def get_asyncio_queue(loop: asyncio.AbstractEventLoop | None = None) -> asyncio.Queue:
    if _use_legacy_asyncio:
        loop = loop or asyncio.get_running_loop()
        return asyncio.Queue(loop=loop)
    else:
        return asyncio.Queue()


_IPC_PATH: str = os.getenv("VERCEL_IPC_PATH", "")
_IPC_SOCK: socket.socket | None = None
_IPC_LOCK: threading.Lock = threading.Lock()


def _ensure_ipc_connected() -> socket.socket | None:
    global _IPC_SOCK
    if not _IPC_PATH:
        return None
    if _IPC_SOCK is not None:
        return _IPC_SOCK
    sock = None
    try:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.connect(_IPC_PATH)
        _IPC_SOCK = sock
        return _IPC_SOCK
    except Exception:
        try:
            if sock is not None:
                sock.close()
        except Exception:
            pass
        _IPC_SOCK = None
        return None


def _close_ipc_socket() -> None:
    global _IPC_SOCK
    try:
        if _IPC_SOCK is not None:
            try:
                _IPC_SOCK.close()
            except Exception:
                pass
    finally:
        _IPC_SOCK = None


if _IPC_PATH:
    try:
        atexit.register(_close_ipc_socket)
    except Exception:
        pass


def send_message(message: dict) -> bool:
    if not _IPC_PATH:
        return False
    data = (json.dumps(message) + '\0').encode()
    with _IPC_LOCK:
        sock = _ensure_ipc_connected()
        if sock is None:
            return False
        try:
            sock.sendall(data)
            return True
        except Exception:
            # Attempt one reconnect on failure
            _close_ipc_socket()
            sock = _ensure_ipc_connected()
            if sock is None:
                return False
            try:
                sock.sendall(data)
                return True
            except Exception:
                _close_ipc_socket()
                return False


# Override logging to maps logs to the correct request
def logging_wrapper(storage: ContextVar, func: Callable, level: str = "info") -> Callable:
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        context = storage.get()
        if context is not None:
            sent = send_message({
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
            if not sent:
                func(*args, **kwargs)
        else:
            func(*args, **kwargs)
    return wrapper


def init_logging(storage: ContextVar) -> None:
    logging.basicConfig(level=logging.INFO, stream=sys.stdout, force=True)
    logging.debug = logging_wrapper(storage, logging.debug)
    logging.info = logging_wrapper(storage, logging.info)
    logging.warning = logging_wrapper(storage, logging.warning, "warn")
    logging.error = logging_wrapper(storage, logging.error, "error")
    logging.critical = logging_wrapper(storage, logging.critical, "error")


def attach_stream_wrappers(storage: ContextVar) -> None:
    sys.stdout = StreamWrapper(storage, sys.stdout, "stdout")
    sys.stderr = StreamWrapper(storage, sys.stderr, "stderr")


def wrap_print() -> None:
    import builtins
    def print_wrapper(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            sys.stdout.write(' '.join(map(str, args)) + '\n')
        return wrapper
    builtins.print = print_wrapper(builtins.print)


def install_urllib3_metrics(storage: ContextVar) -> None:
    try:
        import urllib3
        from urllib.parse import urlparse

        fetchId = 0

        def timed_request(func):
            def wrapper(self, method, url, *args, **kwargs):
                nonlocal fetchId
                fetchId += 1
                start_time_ms = int(time.time() * 1000)
                result = func(self, method, url, *args, **kwargs)
                elapsed = int(time.time() * 1000) - start_time_ms
                parsed = urlparse(url)
                context = storage.get()
                if context is not None:
                    send_message({
                        "type": "metric",
                        "payload": {
                            "context": {
                                "invocationId": context.get('invocationId'),
                                "requestId": context.get('requestId'),
                            },
                            "type": "fetch-metric",
                            "payload": {
                                "pathname": parsed.path,
                                "search": parsed.query,
                                "start": start_time_ms,
                                "duration": elapsed,
                                "host": parsed.hostname or getattr(self, 'host', ''),
                                "statusCode": getattr(result, 'status', None),
                                "method": method,
                                "id": fetchId,
                            }
                        }
                    })
                return result
            return wrapper

        urllib3.connectionpool.HTTPConnectionPool.urlopen = timed_request(
            urllib3.connectionpool.HTTPConnectionPool.urlopen
        )
    except Exception:
        pass


class StreamWrapper:
    def __init__(self, storage: ContextVar, stream: TextIO, stream_name: str):
        self.storage = storage
        self.stream = stream
        self.stream_name = stream_name

    def write(self, message: str):
        context = self.storage.get()
        if context is not None:
            sent = send_message({
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
            if not sent:
                self.stream.write(message)
        else:
            self.stream.write(message)

    def __getattr__(self, name: str):
        return getattr(self.stream, name)


def decode_body_from_payload(payload: dict) -> bytes:
    body = payload.get('body', b'')
    if payload.get('encoding') == 'base64':
        try:
            return base64.b64decode(body)
        except Exception:
            # Fallback to raw bytes
            try:
                return body if isinstance(body, (bytes, bytearray)) else (body or '').encode()
            except Exception:
                return b''
    if isinstance(body, (bytes, bytearray)):
        return bytes(body)
    if body is None:
        return b''
    return str(body).encode()


def asgi_headers_to_multi_value(headers_bytes: list[tuple[bytes, bytes]]) -> dict[str, list[str]]:
    """
    Convert ASGI headers ([[name: bytes, value: bytes], ...]) to
    a multi-value dict[str, list[str]] expected by Vercel runtime.
    """
    result = {}
    for item in headers_bytes or []:
        # Support both tuple and list shapes
        if not item:
            continue
        try:
            name, value = item
        except Exception:
            continue
        try:
            key = name.decode('latin1') if hasattr(name, 'decode') else str(name)
            val = value.decode('latin1') if hasattr(value, 'decode') else str(value)
        except Exception:
            key = str(name)
            val = str(value)
        result.setdefault(key, []).append(val)
    return result


def build_asgi_scope_from_payload(payload: dict) -> dict:
    headers = payload.get('headers', {}) or {}
    url = urlparse(payload['path'])

    headers_encoded = []
    for k, v in headers.items():
        if isinstance(v, list):
            for i in v:
                headers_encoded.append([k.lower().encode(), str(i).encode()])
        else:
            headers_encoded.append([k.lower().encode(), str(v).encode()])

    server_host = headers.get('host', 'lambda')
    try:
        server_port = int(headers.get('x-forwarded-port', 80))
    except Exception:
        server_port = 80

    client_ip = headers.get('x-forwarded-for', headers.get('x-real-ip', payload.get('true-client-ip', '')))

    scope = {
        'server': (server_host, server_port),
        'client': (client_ip, 0),
        'scheme': headers.get('x-forwarded-proto', 'http'),
        'root_path': '',
        'query_string': url.query.encode(),
        'headers': headers_encoded,
        'type': 'http',
        'http_version': '1.1',
        'method': payload['method'],
        'path': url.path,
        'raw_path': url.path.encode(),
    }
    return scope


def add_vendor_to_path(entrypoint: str, vendor: str) -> None:
    if os.path.isdir(vendor):
        # Process .pth files like a real site-packages dir
        site.addsitedir(vendor)

        # Move _vendor to the front (after script dir if present)
        try:
            while vendor in sys.path:
                sys.path.remove(vendor)
        except ValueError:
            pass

        # Put vendored deps ahead of site-packages but after the script dir
        idx = 1 if (sys.path and sys.path[0] in ('', entrypoint)) else 0
        sys.path.insert(idx, vendor)

        importlib.invalidate_caches()


def is_asgi_app(app: ASGI | WSGI) -> bool:
    return (
        inspect.iscoroutinefunction(app)
        or inspect.iscoroutinefunction(getattr(app, '__call__', None))
    )
