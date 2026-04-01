from __future__ import annotations

import asyncio
import atexit
import base64
import builtins
import contextlib
import contextvars
import functools
import http
import json
import logging
import os
import socket
import sys
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import TYPE_CHECKING, Any, Literal, Never, TextIO

from vercel_runtime.crons import (
    bootstrap_cron_service_app,
    is_cron_service,
)
from vercel_runtime.headers import (
    clear_vercel_headers_context,
    decode_header_bytes,
    normalize_event_header_pairs,
    normalize_event_headers,
    set_vercel_headers_from_asgi_pairs,
    set_vercel_headers_from_http_headers,
)
from vercel_runtime.resolver import (
    detect_app_type,
    import_module,
    resolve_app,
)
from vercel_runtime.routing import (
    apply_service_route_prefix_to_asgi_scope,
    apply_service_route_prefix_to_target,
    split_request_target,
)
from vercel_runtime.workers import (
    bootstrap_worker_service_app,
    is_celery_app,
    is_worker_service,
    prepare_celery_environment,
)

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

type _IpcMessage = dict[str, Any]
type _ASGIScope = dict[str, Any]
type _ASGIReceive = Callable[[], Awaitable[dict[str, Any]]]
type _ASGISend = Callable[[dict[str, Any]], Awaitable[None]]
type _ASGIApp = Callable[[_ASGIScope, _ASGIReceive, _ASGISend], Awaitable[None]]

_original_stderr = sys.stderr

# --- IPC socket & send_message (must be available before _fatal) ----------
_ipc_sock: socket.socket | None = None
if "VERCEL_IPC_PATH" in os.environ:
    _ipc_sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    with contextlib.suppress(Exception):
        _ipc_sock.connect(os.environ["VERCEL_IPC_PATH"])


def send_message(message: _IpcMessage) -> None:
    if _ipc_sock is not None:
        with contextlib.suppress(Exception):
            _ipc_sock.sendall((json.dumps(message) + "\0").encode())


# -------------------------------------------------------------------------


def _stderr(message: str) -> None:
    with contextlib.suppress(Exception):
        _original_stderr.write(message + "\n")
        _original_stderr.flush()


def _fatal(message: str) -> Never:
    _stderr(message)
    _send_unrecoverable_error(message)
    sys.exit(1)


def _fatal_exc(label: str) -> Never:
    """Report a fatal exception (with traceback) and exit."""
    _fatal(f"{label}:\n{traceback.format_exc()}")


def _send_unrecoverable_error(message: str) -> None:
    """Send an ``unrecoverable-error`` IPC message to the functions runtime.

    This is the only message type (besides ``server-started``) that the
    functions runtime accepts before the handshake completes, so it is the
    correct way to report fatal errors during module import.
    """
    send_message(
        {
            "type": "unrecoverable-error",
            "payload": {
                "exitCode": 1,
                "message": message,
            },
        }
    )


def _must_getenv(varname: str) -> str:
    value = os.environ.get(varname)
    if not value:
        _fatal(f"{varname} is not set")
    return value


_here = os.path.dirname(__file__)
_entrypoint_rel = _must_getenv("__VC_HANDLER_ENTRYPOINT")
_entrypoint_abs = _must_getenv("__VC_HANDLER_ENTRYPOINT_ABS")
_entrypoint_modname = _must_getenv("__VC_HANDLER_MODULE_NAME")
_entrypoint_varname = _must_getenv("__VC_HANDLER_VARIABLE_NAME")


def setup_logging(
    send_message: Callable[[_IpcMessage], None],
    storage: contextvars.ContextVar[dict[str, str | int] | None],
) -> None:
    # Override logging.Handler to send logs to the platform
    # when a request context is available.
    class VCLogHandler(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            try:
                message = record.getMessage()
            except Exception:
                message = repr(getattr(record, "msg", ""))

            with contextlib.suppress(Exception):
                if record.exc_info:
                    # logging allows exc_info=True or a (type, value, tb) tuple
                    exc_info = record.exc_info
                    if exc_info is True:  # type: ignore[comparison-overlap]
                        exc_info = sys.exc_info()
                    if isinstance(exc_info, tuple):  # pyright: ignore[reportUnnecessaryIsInstance]
                        tb = "".join(traceback.format_exception(*exc_info))
                        if tb:
                            message = f"{message}\n{tb}" if message else tb

            if record.levelno >= logging.CRITICAL:
                level = "fatal"
            elif record.levelno >= logging.ERROR:
                level = "error"
            elif record.levelno >= logging.WARNING:
                level = "warn"
            elif record.levelno >= logging.INFO:
                level = "info"
            else:
                level = "debug"

            context = storage.get()
            if context is not None:
                send_message(
                    {
                        "type": "log",
                        "payload": {
                            "context": {
                                "invocationId": context["invocationId"],
                                "requestId": context["requestId"],
                            },
                            "message": base64.b64encode(
                                message.encode()
                            ).decode(),
                            "level": level,
                        },
                    }
                )
            else:
                # If IPC is not ready, enqueue the message to be sent later.
                enqueue_or_send_message(
                    {
                        "type": "log",
                        "payload": {
                            "context": {"invocationId": "0", "requestId": 0},
                            "message": base64.b64encode(
                                message.encode()
                            ).decode(),
                            "level": level,
                        },
                    }
                )

    # Override sys.stdout and sys.stderr to map logs to the correct request
    class StreamWrapper:
        def __init__(
            self,
            stream: TextIO,
            stream_name: Literal["stdout", "stderr"],
        ):
            self.stream = stream
            self.stream_name = stream_name

        def write(self, message: str) -> None:
            context = storage.get()
            if context is not None:
                send_message(
                    {
                        "type": "log",
                        "payload": {
                            "context": {
                                "invocationId": context["invocationId"],
                                "requestId": context["requestId"],
                            },
                            "message": base64.b64encode(
                                message.encode()
                            ).decode(),
                            "stream": self.stream_name,
                        },
                    }
                )
            else:
                enqueue_or_send_message(
                    {
                        "type": "log",
                        "payload": {
                            "context": {"invocationId": "0", "requestId": 0},
                            "message": base64.b64encode(
                                message.encode()
                            ).decode(),
                            "stream": self.stream_name,
                        },
                    }
                )

        def __getattr__(self, name: str) -> Any:
            return getattr(self.stream, name)

    sys.stdout = StreamWrapper(sys.stdout, "stdout")
    sys.stderr = StreamWrapper(sys.stderr, "stderr")

    logging.basicConfig(
        level=logging.INFO,
        handlers=[VCLogHandler()],
        force=True,
    )

    # Ensure built-in print funnels through stdout wrapper so prints are
    # attributed to the current request context.
    def print_wrapper(func: Callable[..., None]) -> Callable[..., None]:
        @functools.wraps(func)
        def wrapper(
            *args: object,
            sep: str = " ",
            end: str = "\n",
            file: TextIO | None = None,
            flush: bool = False,
        ) -> None:
            target = file if file is not None else sys.stdout
            if target is not None and target in (
                sys.stdout,
                sys.stderr,
            ):
                target.write(sep.join(map(str, args)) + end)
                if flush:
                    target.flush()
            else:
                # User specified a different file, use original print behavior
                func(*args, sep=sep, end=end, file=file, flush=flush)

        return wrapper

    builtins.print = print_wrapper(builtins.print)


# If running in the platform (IPC present), logging must be
# setup before importing user code so that logs happening
# outside the request context are emitted correctly.
storage: contextvars.ContextVar[dict[str, str | int] | None] = (
    contextvars.ContextVar(
        "storage",
        default=None,
    )
)


# Buffer for pre-handshake logs (to avoid blocking IPC on startup)
_ipc_ready = False
_init_log_buf: list[_IpcMessage] = []
_INIT_LOG_BUF_MAX_BYTES = 1_000_000
_init_log_buf_bytes = 0


def enqueue_or_send_message(msg: _IpcMessage) -> None:
    global _init_log_buf_bytes  # noqa: PLW0603
    if _ipc_ready:
        send_message(msg)
        return

    enc_len = len(json.dumps(msg))

    if _init_log_buf_bytes + enc_len <= _INIT_LOG_BUF_MAX_BYTES:
        _init_log_buf.append(msg)
        _init_log_buf_bytes += enc_len
    else:
        # Fallback so message is not lost if buffer is full
        with contextlib.suppress(Exception):
            payload = msg.get("payload", {})
            decoded = base64.b64decode(
                payload.get("message", ""),
            ).decode(errors="ignore")
            _original_stderr.write(decoded + "\n")


def _flush_init_log_buf() -> None:
    """Flush buffered init logs through IPC and mark the channel as ready.

    Called once the ``server-started`` handshake is complete so the functions
    runtime will accept ``log`` messages.
    """
    global _ipc_ready, _init_log_buf_bytes  # noqa: PLW0603
    _ipc_ready = True
    for m in _init_log_buf:
        send_message(m)
    _init_log_buf.clear()
    _init_log_buf_bytes = 0


def flush_init_log_buf_to_stderr() -> None:
    global _init_log_buf_bytes  # noqa: PLW0603
    try:
        combined: list[str] = []
        for m in _init_log_buf:
            payload = m.get("payload", {})
            msg = payload.get("message")
            if not msg:
                continue
            with contextlib.suppress(Exception):
                decoded = base64.b64decode(msg).decode(errors="ignore")
                combined.append(decoded)
        if combined:
            _stderr("".join(combined))
    except Exception:
        pass
    finally:
        _init_log_buf.clear()
        _init_log_buf_bytes = 0


atexit.register(flush_init_log_buf_to_stderr)


if _ipc_sock is not None:
    setup_logging(send_message, storage)


# Runtime dependency installation for large Lambda functions
# The _uv directory is at the Lambda root, two levels up from this file
# (this file is at /var/task/_vendor/vercel_runtime/vc_init.py)
lambda_root = os.path.normpath(os.path.join(_here, "..", ".."))
_uv_dir = os.path.join(lambda_root, "_uv")
_runtime_config_path = os.path.join(_uv_dir, "_runtime_config.json")

if os.path.exists(_runtime_config_path):
    import site
    import subprocess

    with open(_runtime_config_path) as runtime_config_file:
        _config = json.load(runtime_config_file)
    _project_dir = os.path.join(lambda_root, _config["projectDir"])

    _deps_dir = "/tmp/_vc_deps"
    _site_packages = os.path.join(
        _deps_dir,
        "lib",
        f"python{sys.version_info.major}.{sys.version_info.minor}",
        "site-packages",
    )
    _marker = os.path.join(_deps_dir, ".installed")

    if not os.path.exists(_marker):
        # Cold start: install public dependencies using bundled uv
        _uv_path = os.path.join(_uv_dir, "uv")

        _stderr("Installing runtime dependencies...")
        _install_start = time.time()

        try:
            os.makedirs(_deps_dir, exist_ok=True)

            # Create a minimal PEP 405 venv skeleton for uv sync.
            # Writing pyvenv.cfg directly avoids spawning a subprocess.
            os.makedirs(_site_packages, exist_ok=True)
            with open(os.path.join(_deps_dir, "pyvenv.cfg"), "w") as _f:
                _f.write(f"home = {os.path.dirname(sys.executable)}\n")
                _f.write("include-system-site-packages = false\n")

            # Use uv sync --inexact --frozen to install only the
            # missing public packages. --inexact avoids removing
            # packages already present in _vendor (bundled deps).
            # --link-mode hardlink lets the temporary download cache
            # and the target venv share inode blocks on /tmp, reducing
            # peak disk usage on Lambda's limited ephemeral storage.
            _sync_cmd = [
                _uv_path,
                "sync",
                "--inexact",
                "--active",
                "--frozen",
                "--no-dev",
                "--no-editable",
                "--no-install-project",
                "--no-build",
                "--no-cache",
                "--no-progress",
                "--link-mode",
                "hardlink",
            ]
            for _pkg in _config.get("bundledPackages", []):
                _sync_cmd.extend(["--no-install-package", _pkg])
            subprocess.run(
                _sync_cmd,
                check=True,
                text=True,
                cwd=_project_dir,
                env={
                    "PATH": os.environ.get("PATH", ""),
                    "VIRTUAL_ENV": _deps_dir,
                    "UV_PYTHON_DOWNLOADS": "never",
                },
            )
            _install_duration = time.time() - _install_start
            _stderr(
                f"Runtime dependencies installed in {_install_duration:.2f}s"
            )
        except subprocess.CalledProcessError as e:
            _fatal(
                f"Runtime dependency installation failed.\n"
                f"Command: {' '.join(e.cmd)}\n"
                f"Exit code: {e.returncode}"
            )
        except Exception as e:
            _fatal(
                f"Runtime dependency installation"
                f" failed with unexpected error: {e}"
            )

        # Mark installation complete for warm starts
        open(_marker, "w").close()
    else:
        _stderr("Using cached runtime dependencies")

    # Add runtime-installed deps to path (must come before user code import)
    if os.path.isdir(_site_packages):
        site.addsitedir(_site_packages)
        # Move to front of path so these packages take precedence
        try:
            while _site_packages in sys.path:
                sys.path.remove(_site_packages)
        except ValueError:
            pass
        sys.path.insert(0, _site_packages)

# Allow quirks to prepend directories to PATH (e.g. for bundled shims).
_extra_path = os.environ.get("VERCEL_RUNTIME_ENV_PATH_PREPEND")
if _extra_path:
    os.environ["PATH"] = _extra_path + ":" + os.environ.get("PATH", "")

try:
    prepare_celery_environment()
    __vc_module = import_module(_entrypoint_modname, _entrypoint_abs)
    __vc_variables = dir(__vc_module)
except Exception:
    _fatal_exc(f'could not import "{_entrypoint_rel}"')

if is_worker_service():
    if "handler" not in __vc_variables and "Handler" not in __vc_variables:
        should_bootstrap_worker_app = (
            "app" not in __vc_variables
            or is_celery_app(getattr(__vc_module, "app", None))
        )
    else:
        should_bootstrap_worker_app = False

    if should_bootstrap_worker_app:
        try:
            __vc_module.__dict__["app"] = bootstrap_worker_service_app(
                __vc_module
            )
            __vc_variables = dir(__vc_module)
        except Exception:
            _stderr("Error bootstrapping worker service app:")
            _stderr(traceback.format_exc())
            exit(1)

if is_cron_service():
    try:
        __vc_module.__dict__["app"] = bootstrap_cron_service_app(__vc_module)
        __vc_variables = dir(__vc_module)
    except Exception:
        _stderr("Error bootstrapping cron service app:")
        _stderr(traceback.format_exc())
        exit(1)

_use_legacy_asyncio = sys.version_info < (3, 10)


def format_headers(
    headers: Any,
    *,
    decode: bool = False,
) -> dict[str, list[str]]:
    key_to_list: dict[str, list[str]] = {}
    for key, value in headers.items():
        if decode and hasattr(key, "decode") and hasattr(value, "decode"):
            key = key.decode()  # noqa: PLW2901
            value = value.decode()  # noqa: PLW2901
        if key not in key_to_list:
            key_to_list[key] = []
        key_to_list[key].append(value)
    return key_to_list


class ASGIMiddleware:
    """ASGI middleware for Vercel IPC request lifecycle.

    - Handles /_vercel/ping
    - Extracts x-vercel-internal-* headers and removes them from downstream app
    - Sets request context into `storage` for logging/metrics
    - Emits handler-started and end IPC messages.
    """

    def __init__(self, app: _ASGIApp | Any) -> None:
        self.app = app

    async def __call__(
        self,
        scope: _ASGIScope,
        receive: _ASGIReceive,
        send: _ASGISend,
    ) -> None:
        if scope.get("type") != "http":
            # Non-HTTP traffic is forwarded verbatim
            await self.app(scope, receive, send)
            return

        if scope.get("path") == "/_vercel/ping":
            await send(
                {
                    "type": "http.response.start",
                    "status": 200,
                    "headers": [],
                }
            )
            await send(
                {
                    "type": "http.response.body",
                    "body": b"",
                    "more_body": False,
                }
            )
            return

        # Extract internal headers and set per-request context
        headers_list: list[tuple[bytes | str, bytes | str]] = (
            scope.get("headers", []) or []
        )
        new_headers: list[tuple[bytes, bytes]] = []
        invocation_id = "0"
        request_id = 0
        internal_oidc_token = ""

        for raw_k, raw_v in headers_list:
            key_bytes = raw_k if isinstance(raw_k, bytes) else raw_k.encode()
            val_bytes = raw_v if isinstance(raw_v, bytes) else raw_v.encode()
            key = decode_header_bytes(key_bytes).lower()
            val = decode_header_bytes(val_bytes)
            if key == "x-vercel-internal-invocation-id":
                invocation_id = val
                continue
            if key == "x-vercel-internal-request-id":
                request_id = int(val) if val.isdigit() else 0
                continue
            if key in (
                "x-vercel-internal-span-id",
                "x-vercel-internal-trace-id",
            ):
                continue
            if key == "x-vercel-internal-oidc-token":
                internal_oidc_token = val
                continue
            new_headers.append((key_bytes, val_bytes))

        if internal_oidc_token:
            has_oidc_header = any(
                decode_header_bytes(k).lower() == "x-vercel-oidc-token"
                for k, _ in new_headers
            )
            if not has_oidc_header:
                new_headers.append(
                    (b"x-vercel-oidc-token", internal_oidc_token.encode())
                )

        new_scope = dict(scope)
        new_scope["headers"] = new_headers
        apply_service_route_prefix_to_asgi_scope(new_scope)

        # Announce handler start and set context for logging/metrics
        send_message(
            {
                "type": "handler-started",
                "payload": {
                    "handlerStartedAt": int(time.time() * 1000),
                    "context": {
                        "invocationId": invocation_id,
                        "requestId": request_id,
                    },
                },
            }
        )

        token = storage.set(
            {
                "invocationId": invocation_id,
                "requestId": request_id,
            }
        )
        set_vercel_headers_from_asgi_pairs(new_headers)

        try:
            await self.app(new_scope, receive, send)
        finally:
            clear_vercel_headers_context()
            storage.reset(token)
            send_message(
                {
                    "type": "end",
                    "payload": {
                        "context": {
                            "invocationId": invocation_id,
                            "requestId": request_id,
                        }
                    },
                }
            )


if "VERCEL_IPC_PATH" in os.environ:
    start_time = time.time()

    # Override urlopen from urllib3 (& requests) to send Request Metrics
    try:
        from urllib.parse import urlparse

        import urllib3  # type: ignore[import-not-found]

        def timed_request(func: Any) -> Any:
            fetch_id = 0

            @functools.wraps(func)
            def wrapper(
                self: Any,
                method: str,
                url: str,
                *args: Any,
                **kwargs: Any,
            ) -> Any:
                nonlocal fetch_id
                fetch_id += 1
                start_time = int(time.time() * 1000)
                result = func(self, method, url, *args, **kwargs)
                elapsed_time = int(time.time() * 1000) - start_time
                parsed_url = urlparse(url)
                context = storage.get()
                if context is not None:
                    send_message(
                        {
                            "type": "metric",
                            "payload": {
                                "context": {
                                    "invocationId": context["invocationId"],
                                    "requestId": context["requestId"],
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
                                    "id": fetch_id,
                                },
                            },
                        }
                    )
                return result

            return wrapper

        _pool = urllib3.connectionpool.HTTPConnectionPool  # pyright: ignore[reportUnknownVariableType,reportUnknownMemberType]
        _pool.urlopen = timed_request(_pool.urlopen)  # pyright: ignore[reportUnknownMemberType]
    except Exception:
        pass

    class BaseHandler(BaseHTTPRequestHandler):
        # Re-implementation of BaseHTTPRequestHandler's log_message method to
        # log to stdout instead of stderr.
        def log_message(self, format: str, *args: Any) -> None:
            message = format % args
            addr = self.address_string()
            ts = self.log_date_time_string()
            msg = message.translate(self._control_char_table)  # type: ignore[attr-defined]
            sys.stdout.write(
                f"{addr} - - [{ts}] {msg}\n",
            )

        # Re-implementation of handle_one_request to send
        # the end message after the response is fully sent.
        def handle_one_request(self) -> None:
            self.raw_requestline = self.rfile.readline(65537)
            if not self.raw_requestline:
                self.close_connection = True
                return
            if not self.parse_request():
                return

            if split_request_target(self.path)[0] == "/_vercel/ping":
                self.send_response(200)
                self.end_headers()
                return

            (
                self.path,
                self._vc_service_root_path,
            ) = apply_service_route_prefix_to_target(self.path)
            invocation_id = self.headers.get(
                "x-vercel-internal-invocation-id",
                "0",
            )
            raw_request_id = self.headers.get(
                "x-vercel-internal-request-id",
                "0",
            )
            request_id = int(raw_request_id) if raw_request_id.isdigit() else 0
            del self.headers["x-vercel-internal-invocation-id"]
            del self.headers["x-vercel-internal-request-id"]
            del self.headers["x-vercel-internal-span-id"]
            del self.headers["x-vercel-internal-trace-id"]
            internal_oidc_token = self.headers.get(
                "x-vercel-internal-oidc-token"
            )
            if (
                isinstance(internal_oidc_token, str)
                and internal_oidc_token
                and not self.headers.get("x-vercel-oidc-token")
            ):
                self.headers["x-vercel-oidc-token"] = internal_oidc_token
            with contextlib.suppress(Exception):
                del self.headers["x-vercel-internal-oidc-token"]

            send_message(
                {
                    "type": "handler-started",
                    "payload": {
                        "handlerStartedAt": int(time.time() * 1000),
                        "context": {
                            "invocationId": invocation_id,
                            "requestId": request_id,
                        },
                    },
                }
            )

            token = storage.set(
                {
                    "invocationId": invocation_id,
                    "requestId": request_id,
                }
            )
            set_vercel_headers_from_http_headers(self.headers)

            try:
                self.handle_request()  # type: ignore[attr-defined]
            finally:
                clear_vercel_headers_context()
                storage.reset(token)
                send_message(
                    {
                        "type": "end",
                        "payload": {
                            "context": {
                                "invocationId": invocation_id,
                                "requestId": request_id,
                            }
                        },
                    }
                )

    try:
        app_name, app_obj = resolve_app(
            __vc_module, _entrypoint_modname, _entrypoint_varname
        )
    except RuntimeError as exc:
        _fatal(str(exc))

    if (
        app_name.lower() == "handler"
        and isinstance(app_obj, type)
        and issubclass(app_obj, BaseHTTPRequestHandler)
    ):

        class Handler(BaseHandler, app_obj):  # type: ignore[valid-type,misc]
            def handle_request(self) -> None:
                mname = "do_" + self.command
                if not hasattr(self, mname):
                    self.send_error(
                        http.HTTPStatus.NOT_IMPLEMENTED,
                        f"Unsupported method ({self.command!r})",
                    )
                    return
                method = getattr(self, mname)
                method()
                self.wfile.flush()

    else:
        try:
            detection_result = detect_app_type(
                app_obj,  # pyright: ignore[reportUnknownArgumentType]
                _entrypoint_modname,
                app_name,
            )
        except RuntimeError as exc:
            _fatal(str(exc))
        if detection_result[0] == "wsgi":
            from io import BytesIO

            wsgi_user_app = detection_result[1]
            string_types = (str,)

            def wsgi_encoding_dance(
                s: str | bytes,
                charset: str = "utf-8",
                errors: str = "replace",
            ) -> str:
                if isinstance(s, str):
                    s = s.encode(charset)
                return s.decode("latin1", errors)

            class Handler(BaseHandler):  # type: ignore[no-redef]
                def handle_request(self) -> None:
                    # Prepare WSGI environment
                    path, query = split_request_target(self.path)
                    service_root_path: str = getattr(
                        self,
                        "_vc_service_root_path",
                        "",
                    )
                    content_length = int(self.headers.get("Content-Length", 0))
                    env: dict[str, Any] = {
                        "CONTENT_LENGTH": str(content_length),
                        "CONTENT_TYPE": self.headers.get("content-type", ""),
                        "SCRIPT_NAME": service_root_path,
                        "PATH_INFO": path,
                        "QUERY_STRING": query,
                        "REMOTE_ADDR": self.headers.get(
                            "x-forwarded-for", self.headers.get("x-real-ip")
                        ),
                        "REQUEST_METHOD": self.command,
                        "SERVER_NAME": self.headers.get("host", "lambda"),
                        "SERVER_PORT": self.headers.get(
                            "x-forwarded-port", "80"
                        ),
                        "SERVER_PROTOCOL": "HTTP/1.1",
                        "wsgi.errors": sys.stderr,
                        "wsgi.input": BytesIO(self.rfile.read(content_length)),
                        "wsgi.multiprocess": False,
                        "wsgi.multithread": False,
                        "wsgi.run_once": False,
                        "wsgi.url_scheme": self.headers.get(
                            "x-forwarded-proto", "http"
                        ),
                        "wsgi.version": (1, 0),
                    }
                    for key, value in env.items():
                        if isinstance(value, string_types):
                            env[key] = wsgi_encoding_dance(value)
                    for k, v in self.headers.items():
                        env["HTTP_" + k.replace("-", "_").upper()] = v

                    def start_response(
                        status: str,
                        headers: list[tuple[str, str]],
                        exc_info: Any = None,
                    ) -> Callable[[bytes], Any]:
                        code = int(status.split(" ", maxsplit=1)[0])
                        self.send_response(code)
                        for name, value in headers:
                            self.send_header(name, value)
                        self.end_headers()
                        return self.wfile.write

                    # Call the application
                    response = wsgi_user_app(env, start_response)
                    try:
                        for data in response:
                            if data:
                                self.wfile.write(data)
                                self.wfile.flush()
                    finally:
                        if hasattr(response, "close"):
                            response.close()  # pyright: ignore[reportUnknownMemberType,reportAttributeAccessIssue]

        else:
            # ASGI: Run with Uvicorn for proper lifespan
            # and protocol handling
            from vercel_runtime._vendor import uvicorn

            asgi_user_app = detection_result[1]
            asgi_app = ASGIMiddleware(asgi_user_app)

            # Pre-bind a socket to obtain an ephemeral port for IPC announcement
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(("127.0.0.1", 0))
            sock.listen(2048)
            http_port = sock.getsockname()[1]

            config = uvicorn.Config(
                app=asgi_app,
                fd=sock.fileno(),
                lifespan="auto",
                access_log=False,
                log_config=None,
                log_level="warning",
            )
            server = uvicorn.Server(config)

            send_message(
                {
                    "type": "server-started",
                    "payload": {
                        "initDuration": int((time.time() - start_time) * 1000),
                        "httpPort": http_port,
                    },
                }
            )
            _flush_init_log_buf()

            # Run the server (blocking)
            server.run()
            # If the server ever returns, exit
            sys.exit(0)

    if "Handler" in locals():
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)  # type: ignore[assignment]
        send_message(
            {
                "type": "server-started",
                "payload": {
                    "initDuration": int((time.time() - start_time) * 1000),
                    "httpPort": server.server_address[1],  # type: ignore[attr-defined]
                },
            }
        )
        _flush_init_log_buf()
        server.serve_forever()  # type: ignore[attr-defined]

try:
    app_name, app_obj = resolve_app(
        __vc_module, _entrypoint_modname, _entrypoint_varname
    )
except RuntimeError as exc:
    _fatal(str(exc))

if (
    app_name.lower() == "handler"
    and isinstance(app_obj, type)
    and issubclass(app_obj, BaseHTTPRequestHandler)
):
    _stderr("using HTTP Handler")
    import _thread  # noqa: PLC2701
    import http.client
    from http.server import HTTPServer

    server = HTTPServer(("127.0.0.1", 0), app_obj)  # type: ignore[assignment]
    port = server.server_address[1]  # type: ignore[attr-defined]

    def vc_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
        _thread.start_new_thread(server.handle_request, ())  # type: ignore[attr-defined]

        payload = json.loads(event["body"])
        path, _ = apply_service_route_prefix_to_target(payload["path"])
        headers = normalize_event_headers(payload.get("headers", {}))
        method = payload["method"]
        encoding = payload.get("encoding")
        body = payload.get("body")

        if (body is not None and len(body) > 0) and (
            encoding is not None and encoding == "base64"
        ):
            body = base64.b64decode(body)

        request_body = body.encode("utf-8") if isinstance(body, str) else body
        conn = http.client.HTTPConnection("127.0.0.1", port)
        try:
            conn.request(method, path, headers=headers, body=request_body)
        except (OSError, http.client.HTTPException) as ex:
            _stderr(f"Request Error: {ex}")
        res = conn.getresponse()

        return_dict: dict[str, Any] = {
            "statusCode": res.status,
            "headers": format_headers(res.headers),
        }

        data = res.read()

        try:
            return_dict["body"] = data.decode("utf-8")
        except UnicodeDecodeError:
            return_dict["body"] = base64.b64encode(data).decode("utf-8")
            return_dict["encoding"] = "base64"

        return return_dict

else:
    try:
        detection_result = detect_app_type(
            app_obj,  # pyright: ignore[reportUnknownArgumentType]
            _entrypoint_modname,
            app_name,
        )
    except RuntimeError as exc:
        _fatal(str(exc))
    if detection_result[0] == "wsgi":
        _stderr("using Web Server Gateway Interface (WSGI)")
        from io import BytesIO

        from vercel_runtime._vendor.werkzeug.datastructures import Headers
        from vercel_runtime._vendor.werkzeug.wrappers import Response

        wsgi_user_app = detection_result[1]
        string_types = (str,)

        _default_charset = sys.getdefaultencoding()

        def to_bytes(
            x: str | bytes | bytearray | memoryview | None,
            charset: str = _default_charset,
            errors: str = "strict",
        ) -> bytes | None:
            if x is None:
                return None
            if isinstance(x, (bytes, bytearray, memoryview)):
                return bytes(x)
            if isinstance(x, str):  # pyright: ignore[reportUnnecessaryIsInstance]
                return x.encode(charset, errors)
            raise TypeError("Expected bytes")

        def wsgi_encoding_dance(
            s: str | bytes,
            charset: str = "utf-8",
            errors: str = "replace",
        ) -> str:
            if isinstance(s, str):
                s = s.encode(charset)
            return s.decode("latin1", errors)

        def vc_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
            payload = json.loads(event["body"])

            raw_headers = normalize_event_headers(payload.get("headers", {}))
            headers = Headers(raw_headers)

            body: Any = payload.get("body", "")
            if body and payload.get("encoding") == "base64":
                body = base64.b64decode(body)
            if isinstance(body, string_types):
                body = to_bytes(body, charset="utf-8")

            (
                request_target,
                service_root_path,
            ) = apply_service_route_prefix_to_target(payload["path"])
            path, query = split_request_target(request_target)

            environ: dict[str, Any] = {
                "CONTENT_LENGTH": str(len(body)),
                "CONTENT_TYPE": headers.get("content-type", ""),
                "SCRIPT_NAME": service_root_path,
                "PATH_INFO": path,
                "QUERY_STRING": query,
                "REMOTE_ADDR": headers.get(
                    "x-forwarded-for",
                    headers.get("x-real-ip", payload.get("true-client-ip", "")),
                ),
                "REQUEST_METHOD": payload["method"],
                "SERVER_NAME": headers.get("host", "lambda"),
                "SERVER_PORT": headers.get("x-forwarded-port", "80"),
                "SERVER_PROTOCOL": "HTTP/1.1",
                "event": event,
                "context": context,
                "wsgi.errors": sys.stderr,
                "wsgi.input": BytesIO(body),
                "wsgi.multiprocess": False,
                "wsgi.multithread": False,
                "wsgi.run_once": False,
                "wsgi.url_scheme": headers.get("x-forwarded-proto", "http"),
                "wsgi.version": (1, 0),
            }

            for key, value in environ.items():
                if isinstance(value, string_types):
                    environ[key] = wsgi_encoding_dance(value)

            for hdr_key, value in headers.items():
                env_key = "HTTP_" + hdr_key.upper().replace("-", "_")
                if env_key not in ("HTTP_CONTENT_TYPE", "HTTP_CONTENT_LENGTH"):
                    environ[env_key] = value

            set_vercel_headers_from_http_headers(raw_headers)
            try:
                response = Response.from_app(wsgi_user_app, environ)
            finally:
                clear_vercel_headers_context()

            return_dict: dict[str, Any] = {
                "statusCode": response.status_code,
                "headers": format_headers(response.headers),
            }

            if response.data:
                return_dict["body"] = base64.b64encode(
                    response.data,
                ).decode("utf-8")
                return_dict["encoding"] = "base64"

            return return_dict

    else:
        _stderr("using Asynchronous Server Gateway Interface (ASGI)")
        # Originally authored by Jordan Eremieff and included under MIT license:
        # https://github.com/erm/mangum/blob/b4d21c8f5e304a3e17b88bc9fa345106acc50ad7/mangum/__init__.py
        # https://github.com/erm/mangum/blob/b4d21c8f5e304a3e17b88bc9fa345106acc50ad7/LICENSE
        import asyncio
        import enum

        from vercel_runtime._vendor.werkzeug.datastructures import Headers

        asgi_user_app = detection_result[1]

        # asyncio.Runner keeps a persistent event loop across run() calls.
        # The lifespan task stays suspended (awaiting the shutdown signal)
        # while successive HTTP requests are dispatched on the same loop.
        _asgi_runner = asyncio.Runner()

        # --- ASGI Lifespan Protocol ---
        _lifespan_receive_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        _lifespan_send_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        _lifespan_task: asyncio.Task[None] | None = None
        _lifespan_active = False

        async def _lifespan_startup(asgi_app: Any) -> bool:
            """Run the ASGI lifespan startup sequence.

            Returns True when the app acknowledges startup, False otherwise.
            The lifespan task remains suspended (awaiting the shutdown
            signal) so it stays alive for the duration of the process.
            """
            scope: _ASGIScope = {
                "type": "lifespan",
                "asgi": {"version": "3.0", "spec_version": "2.0"},
            }

            async def receive() -> dict[str, Any]:
                return await _lifespan_receive_queue.get()

            async def send(message: dict[str, Any]) -> None:
                await _lifespan_send_queue.put(message)

            # Start the lifespan coroutine as a background task.
            # Store in outer scope to prevent GC (event loop holds weak refs).
            global _lifespan_task  # noqa: PLW0603
            _lifespan_task = asyncio.create_task(asgi_app(scope, receive, send))

            # Ask the app to start up.
            await _lifespan_receive_queue.put({"type": "lifespan.startup"})

            # Race: wait for the app to respond OR the task to finish
            # (apps that don't support lifespan return immediately).
            send_future = asyncio.create_task(_lifespan_send_queue.get())
            done, pending = await asyncio.wait(
                {send_future, _lifespan_task},
                timeout=30,
                return_when=asyncio.FIRST_COMPLETED,
            )

            if send_future not in done:
                # App completed or timed out without responding.
                for p in pending:
                    p.cancel()
                _lifespan_task = None
                return False

            msg = send_future.result()
            if msg.get("type") == "lifespan.startup.complete":
                return True
            if msg.get("type") == "lifespan.startup.failed":
                _stderr(
                    "ASGI lifespan startup failed: " + msg.get("message", "")
                )
            _lifespan_task.cancel()
            _lifespan_task = None
            return False

        try:
            _lifespan_active = _asgi_runner.run(
                _lifespan_startup(asgi_user_app)
            )
        except BaseException:
            # App doesn't support lifespan — proceed without it.
            _lifespan_active = False

        def _lifespan_shutdown() -> None:
            if not _lifespan_active:
                return

            async def _do_shutdown() -> None:
                await _lifespan_receive_queue.put({"type": "lifespan.shutdown"})
                with contextlib.suppress(TimeoutError, asyncio.CancelledError):
                    async with asyncio.timeout(10):
                        await _lifespan_send_queue.get()

            with contextlib.suppress(BaseException):
                _asgi_runner.run(_do_shutdown())

        atexit.register(_lifespan_shutdown)

        # --- HTTP Request Handling ---

        class ASGICycleState(enum.Enum):
            REQUEST = enum.auto()
            RESPONSE = enum.auto()

        class ASGICycle:
            def __init__(self, scope: _ASGIScope) -> None:
                self.scope = scope
                self.body = b""
                self.state = ASGICycleState.REQUEST
                self.app_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
                self.response: dict[str, Any] = {}

            def __call__(self, app: Any, body: bytes) -> dict[str, Any]:
                """Build and run the ASGI instance.

                Receives the application and any body
                included in the request, then builds the
                ASGI instance using the connection scope.
                Runs until the response is completely read
                from the application.
                """
                self.app_queue = asyncio.Queue()
                self.put_message(
                    {
                        "type": "http.request",
                        "body": body,
                        "more_body": False,
                    }
                )

                asgi_instance = app(self.scope, self.receive, self.send)
                _asgi_runner.run(asgi_instance)
                return self.response

            def put_message(self, message: dict[str, Any]) -> None:
                self.app_queue.put_nowait(message)

            async def receive(self) -> dict[str, Any]:
                """Receive messages in the queue."""
                message = await self.app_queue.get()
                return message

            async def send(self, message: dict[str, Any]) -> None:
                """Send messages to the current cycle."""
                message_type = message["type"]

                if self.state is ASGICycleState.REQUEST:
                    if message_type != "http.response.start":
                        raise RuntimeError(
                            f"Expected 'http.response.start',"
                            f" received: {message_type}"
                        )

                    status_code = message["status"]
                    raw_headers: list[tuple[bytes | str, bytes | str]] = (
                        message.get("headers", [])
                    )

                    # Headers from werkzeug transform bytes header value
                    # from b'value' to "b'value'" so we need to process
                    # ASGI headers manually
                    decoded_headers: list[tuple[str, str]] = []
                    for key, value in raw_headers:
                        decoded_key = (
                            key.decode() if isinstance(key, bytes) else key
                        )
                        decoded_value = (
                            value.decode()
                            if isinstance(value, bytes)
                            else value
                        )
                        decoded_headers.append((decoded_key, decoded_value))

                    headers = Headers(decoded_headers)

                    self.on_request(headers, status_code)
                    self.state = ASGICycleState.RESPONSE

                elif self.state is ASGICycleState.RESPONSE:
                    if message_type != "http.response.body":
                        raise RuntimeError(
                            f"Expected 'http.response.body',"
                            f" received: {message_type}"
                        )

                    body = message.get("body", b"")
                    more_body = message.get("more_body", False)

                    # The body must be completely read before
                    # returning the response.
                    self.body += body

                    if not more_body:
                        self.on_response()
                        self.put_message({"type": "http.disconnect"})

            def on_request(self, headers: Any, status_code: int) -> None:
                self.response["statusCode"] = status_code
                self.response["headers"] = format_headers(headers, decode=True)

            def on_response(self) -> None:
                if self.body:
                    self.response["body"] = base64.b64encode(
                        self.body,
                    ).decode("utf-8")
                    self.response["encoding"] = "base64"

        def vc_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
            payload = json.loads(event["body"])

            header_pairs = normalize_event_header_pairs(
                payload.get("headers", {})
            )
            headers: dict[str, str] = {}
            headers_encoded: list[tuple[bytes, bytes]] = []
            for key, value in header_pairs:
                headers[key] = value
                headers_encoded.append((key.lower().encode(), value.encode()))

            body = payload.get("body", b"")
            if payload.get("encoding") == "base64":
                body = base64.b64decode(body)
            elif not isinstance(body, bytes):
                body = body.encode()

            (
                request_target,
                service_root_path,
            ) = apply_service_route_prefix_to_target(payload["path"])
            path, query_str = split_request_target(request_target)
            query = query_str.encode()

            scope: _ASGIScope = {
                "server": (
                    headers.get("host", "lambda"),
                    headers.get("x-forwarded-port", 80),
                ),
                "client": (
                    headers.get(
                        "x-forwarded-for",
                        headers.get(
                            "x-real-ip", payload.get("true-client-ip", "")
                        ),
                    ),
                    0,
                ),
                "scheme": headers.get("x-forwarded-proto", "http"),
                "root_path": service_root_path,
                "query_string": query,
                "headers": headers_encoded,
                "type": "http",
                "http_version": "1.1",
                "method": payload["method"],
                "path": path,
                "raw_path": path.encode(),
            }

            set_vercel_headers_from_http_headers(headers)
            try:
                asgi_cycle = ASGICycle(scope)
                response = asgi_cycle(asgi_user_app, body)
                return response
            finally:
                clear_vercel_headers_context()
