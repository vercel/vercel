from __future__ import annotations

import atexit
import base64
import builtins
import contextlib
import contextvars
import functools
import http
import http.client
import json
import logging
import os
import socket
import sys
import threading
import time
import traceback
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import TYPE_CHECKING, Any, Literal, Never, TextIO

from vercel_runtime import deadline, init_log_buffer
from vercel_runtime.cache import (
    SC_HEADERS_ALWAYS_STRIP,
    SC_HEADERS_STRIP_ON_NO_LEAK,
    SC_NO_HEADER_LEAK_HEADER,
    clear_runtime_cache_context,
    set_runtime_cache_from_asgi_pairs,
    set_runtime_cache_from_http_headers,
)
from vercel_runtime.crons import (
    bootstrap_cron_service_app,
    is_cron_service,
)
from vercel_runtime.headers import (
    INTERNAL_OIDC_HEADER_NAME,
    OIDC_HEADER_NAME,
    append_oidc_header_if_missing,
    clear_vercel_headers_context,
    decode_header_bytes,
    get_oidc_token_for_request,
    is_internal_header,
    normalize_event_header_pairs,
    set_vercel_headers_from_asgi_pairs,
    set_vercel_headers_from_http_headers,
    strip_internal_headers,
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
from vercel_runtime.utils import read_wsgi_request_body
from vercel_runtime.wait_until import (
    WaitUntilCollector,
    begin_wait_until,
    finish_wait_until,
    finish_wait_until_async,
)
from vercel_runtime.workers import (
    install_queue_integrations,
    is_worker_service,
    maybe_bootstrap_worker_service_app,
    prepare_worker_environment,
)
from vercel_runtime.wsgi_websocket import attach_wsgi_websocket

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

type _IpcMessage = dict[str, Any]
type _ASGIScope = dict[str, Any]
type _ASGIReceive = Callable[[], Awaitable[dict[str, Any]]]
type _ASGISend = Callable[[dict[str, Any]], Awaitable[None]]
type _ASGIApp = Callable[[_ASGIScope, _ASGIReceive, _ASGISend], Awaitable[None]]

_original_stderr = sys.stderr

# Cold start baseline when the trampoline did not set one
_MODULE_IMPORTED_AT = time.monotonic()

# --- IPC socket & send_message (must be available before _fatal) ----------
# Hive serves the IPC socket here, which tells it apart from Lambda.
_HIVE_IPC_PATH = "/opt/vercel/ipc.sock"
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

    Besides ``server-started`` itself, this is the only message type the
    functions runtime accepts before ``server-started`` is sent, so it is the
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
                _init_logs.enqueue_or_send(
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
                _init_logs.enqueue_or_send(
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


# Logs written before `server-started` (to avoid blocking IPC)
_init_logs = init_log_buffer.InitLogBuffer(send_message, _stderr)
os.register_at_fork(after_in_child=_init_logs.reinit_lock_after_fork)
atexit.register(_init_logs.flush_to_stderr)


# --- Cold start phase timings ---------------------------------------------
_BOOT_START_ENV = "__VC_PY_BOOT_START_MS"

# Contiguous and in bootstrap order, so they sum to initDuration. Named as the
# node bridge names them, since they share a metric per phase.
_PHASE_BOOTSTRAP = "bootstrap"
_PHASE_IMPORT_FN = "import-fn"
_PHASE_SERVER_READY = "server-ready"

_SERVER_TIMING_HEADER = "x-vercel-internal-timing"

# Readiness probe, answered without invoking user code.
_PING_PATH = "/_vercel/ping"


def _boot_started_at() -> float:
    """Monotonic baseline (seconds): trampoline stamp, else module start."""
    raw = os.environ.get(_BOOT_START_ENV)
    if raw:
        try:
            return int(raw) / 1000
        except ValueError:
            _stderr(f'invalid "{_BOOT_START_ENV}" value: "{raw}"')
    return _MODULE_IMPORTED_AT


_boot_start = _boot_started_at()
_phase_marks: dict[str, float] = {}


def _mark_phase(name: str) -> None:
    """Record the monotonic time at which a cold start phase completed."""
    _phase_marks[name] = time.monotonic()


def _elapsed_ms(start: float, end: float) -> int:
    """Milliseconds between two monotonic readings, clamped at zero."""
    return max(int((end - start) * 1000), 0)


def _cold_start_phases(ready_at: float) -> dict[str, int]:
    """Duration (ms) of each cold start phase."""
    bootstrap_end = _phase_marks.get(_PHASE_BOOTSTRAP, _boot_start)
    import_fn_end = _phase_marks.get(_PHASE_IMPORT_FN, bootstrap_end)
    return {
        _PHASE_BOOTSTRAP: _elapsed_ms(_boot_start, bootstrap_end),
        _PHASE_IMPORT_FN: _elapsed_ms(bootstrap_end, import_fn_end),
        _PHASE_SERVER_READY: _elapsed_ms(import_fn_end, ready_at),
    }


# The cold start phases as a `Server-Timing` value, awaiting the first response.
# `None` once emitted, so warm responses carry nothing.
_pending_server_timing: str | None = None
_pending_server_timing_lock = threading.Lock()


def _format_server_timing(phases: dict[str, int]) -> str:
    """Format phases the way the node bridge formats its own timings.

    Durations are contiguous, so each offset is the sum of the phases before it.
    """
    entries: list[str] = []
    offset = 0
    for name, duration in phases.items():
        entries.append(
            f'{name};dur={duration};desc="{name}_{offset}+{duration}"'
            f";offset={offset}"
        )
        offset += duration
    return ",".join(entries)


def _take_cold_start_timing() -> str | None:
    """The cold start timings, for the first response to ask for them."""
    global _pending_server_timing  # noqa: PLW0603
    # Warm responses skip the lock entirely.
    if _pending_server_timing is None:
        return None
    with _pending_server_timing_lock:
        value = _pending_server_timing
        _pending_server_timing = None
    return value


def _add_cold_start_timing_asgi(message: dict[str, Any]) -> None:
    """Attach the cold start timings to an ASGI `http.response.start`."""
    value = _take_cold_start_timing()
    if value is None:
        return
    headers: list[tuple[bytes, bytes]] = list(message.get("headers") or [])
    headers.append((_SERVER_TIMING_HEADER.encode(), value.encode()))
    message["headers"] = headers


def _send_server_started(http_port: int) -> None:
    """Send ``server-started`` and release buffered init logs."""
    global _pending_server_timing  # noqa: PLW0603
    ready_at = time.monotonic()
    phases = _cold_start_phases(ready_at)
    # The platform reads the breakdown off the first response, so it is only
    # the user-attributable share that `server-started` has to carry.
    _pending_server_timing = _format_server_timing(phases)
    send_message(
        {
            "type": "server-started",
            "payload": {
                "initDuration": _elapsed_ms(_boot_start, ready_at),
                "httpPort": http_port,
                "userInitDuration": phases[_PHASE_IMPORT_FN],
            },
        }
    )
    _init_logs.flush_to_ipc()


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
                    # Skip writing INSTALLER, REQUESTED, and
                    # direct_url.json — they are never read at runtime.
                    "UV_NO_INSTALLER_METADATA": "1",
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

_mark_phase(_PHASE_BOOTSTRAP)

try:
    prepare_worker_environment()
    # Publish-side activation only: subscriber lambdas do the consuming-side
    # activation themselves in their generated handler modules.
    install_queue_integrations(queue_serving=False)
    __vc_module = import_module(_entrypoint_modname, _entrypoint_abs)
    __vc_variables = dir(__vc_module)
except Exception:
    _fatal_exc(f'could not import "{_entrypoint_rel}"')

if is_worker_service():
    try:
        worker_app = maybe_bootstrap_worker_service_app(__vc_module)
        if worker_app is not None:
            __vc_module.__dict__["app"] = worker_app
            __vc_variables = dir(__vc_module)
            _entrypoint_varname = "app"
    except Exception:
        _stderr("Error bootstrapping worker service app:")
        _stderr(traceback.format_exc())
        exit(1)

if is_cron_service():
    try:
        __vc_module.__dict__["app"] = bootstrap_cron_service_app(__vc_module)
        __vc_variables = dir(__vc_module)
        _entrypoint_varname = "app"
    except Exception:
        _stderr("Error bootstrapping cron service app:")
        _stderr(traceback.format_exc())
        exit(1)

_mark_phase(_PHASE_IMPORT_FN)

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
        scope_type = scope.get("type")
        if scope_type not in ("http", "websocket"):
            # Non-HTTP/WebSocket traffic is forwarded verbatim
            await self.app(scope, receive, send)
            return

        if scope_type == "http" and scope.get("path") == _PING_PATH:
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
        deadline_value: str | None = None
        internal_oidc_token: str | None = None
        sc_pairs: list[tuple[bytes, bytes]] = []
        sc_no_header_leak = False

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
            if key == deadline.INTERNAL_DEADLINE_HEADER:
                deadline_value = val
                continue
            if key == INTERNAL_OIDC_HEADER_NAME:
                internal_oidc_token = val
                continue
            if key in SC_HEADERS_ALWAYS_STRIP:
                continue
            if key in SC_HEADERS_STRIP_ON_NO_LEAK:
                # Hold these aside until we know whether the proxy asked us to
                # hide them from client code
                sc_pairs.append((key_bytes, val_bytes))
                if key == SC_NO_HEADER_LEAK_HEADER:
                    sc_no_header_leak = bool(val)
                continue
            if is_internal_header(key):
                continue
            new_headers.append((key_bytes, val_bytes))

        append_oidc_header_if_missing(
            new_headers,
            internal_oidc_token=internal_oidc_token,
        )
        if not sc_no_header_leak:
            # Proxy didn't ask for header hiding, so extend the normal headers
            new_headers.extend(sc_pairs)

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
        deadline_token = deadline.set_deadline(deadline_value)
        set_vercel_headers_from_asgi_pairs(new_headers)
        set_runtime_cache_from_asgi_pairs(sc_pairs)
        wait_until = begin_wait_until()

        request_finished = False

        async def finish_request() -> None:
            nonlocal request_finished
            if request_finished:
                return

            request_finished = True
            try:
                await finish_wait_until_async(wait_until)
            finally:
                clear_runtime_cache_context()
                clear_vercel_headers_context()
                try:
                    storage.reset(token)
                except ValueError:
                    storage.set(None)
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

        async def send_wrapper(message: dict[str, Any]) -> None:
            # Cheapest check first: after the first response there is nothing to
            # report, so the message never has to be inspected.
            if (
                _pending_server_timing is not None
                and message.get("type") == "http.response.start"
            ):
                _add_cold_start_timing_asgi(message)

            await send(message)

            if scope_type != "websocket":
                return

            message_type = message.get("type")
            if message_type == "websocket.accept":
                # End the request lifecycle once the 101 is sent so the
                # platform can begin bidirectional WebSocket streaming.
                await finish_request()
                return

            if message_type == "websocket.close":
                await finish_request()
                return

            if (
                message_type == "websocket.http.response.body"
                and not message.get("more_body")
            ):
                await finish_request()

        try:
            await self.app(new_scope, receive, send_wrapper)
        finally:
            try:
                await finish_request()
            finally:
                # The deadline mirrors Node: it stays readable for the entire
                # handler, including post-accept WebSocket streaming, because
                # the platform still enforces maxDuration on the invocation.
                # Reset here, in the task that created the token, rather than
                # in finish_request, which WebSocket accepts may run from a
                # child task with a copied context.
                deadline.reset_deadline(deadline_token)


# TODO: This was previously the `if "VERCEL_IPC_PATH" in os.environ`
# branch, which has now been removed. To allow more readable PRs, I'm
# going to leave dedenting this to a follow-up (-sully).
with contextlib.nullcontext():
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
        # Headers and body are separate small writes; without TCP_NODELAY,
        # Nagle holds the body until the client ACKs the headers.
        disable_nagle_algorithm = True

        def end_headers(self) -> None:
            # Only the first response reports timings, so every response after
            # it pays one `is not None` and nothing more.
            if _pending_server_timing is not None:
                # The readiness ping is not an invocation, so it must not
                # consume the timings the first real response reports.
                path = split_request_target(getattr(self, "path", ""))[0]
                if path != _PING_PATH:
                    value = _take_cold_start_timing()
                    if value is not None:
                        self.send_header(_SERVER_TIMING_HEADER, value)
            super().end_headers()

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

        def _vc_fire_end_once(self) -> None:
            # Send the IPC "end" message exactly once per request. For a
            # WebSocket upgrade this is called as soon as the 101 handshake is
            # written so the platform can begin bidirectional streaming, while
            # the WSGI worker thread keeps driving the socket. For regular
            # requests it is called once the response is fully sent.
            if getattr(self, "_vc_end_sent", False):
                return
            self._vc_end_sent = True
            try:
                wait_until = getattr(self, "_vc_wait_until", None)
                if isinstance(wait_until, WaitUntilCollector):
                    finish_wait_until(wait_until)
            finally:
                clear_runtime_cache_context()
                clear_vercel_headers_context()
                token = getattr(self, "_vc_end_token", None)
                if token is not None:
                    storage.reset(token)
                send_message(
                    {
                        "type": "end",
                        "payload": {
                            "context": {
                                "invocationId": getattr(
                                    self, "_vc_invocation_id", "0"
                                ),
                                "requestId": getattr(self, "_vc_request_id", 0),
                            }
                        },
                    }
                )

        # Re-implementation of handle_one_request to send
        # the end message after the response is fully sent.
        def handle_one_request(self) -> None:
            self._vc_end_sent = False
            self._vc_end_token = None
            self._vc_wait_until = None
            self.raw_requestline = self.rfile.readline(65537)
            if not self.raw_requestline:
                self.close_connection = True
                return
            if not self.parse_request():
                return

            if split_request_target(self.path)[0] == _PING_PATH:
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
            self._vc_invocation_id = invocation_id
            self._vc_request_id = request_id
            del self.headers["x-vercel-internal-invocation-id"]
            del self.headers["x-vercel-internal-request-id"]
            del self.headers["x-vercel-internal-span-id"]
            del self.headers["x-vercel-internal-trace-id"]
            deadline_value = self.headers.get(deadline.INTERNAL_DEADLINE_HEADER)
            with contextlib.suppress(Exception):
                del self.headers[deadline.INTERNAL_DEADLINE_HEADER]
            raw_internal_oidc_token = self.headers.get(
                INTERNAL_OIDC_HEADER_NAME
            )
            internal_oidc_token = (
                raw_internal_oidc_token
                if isinstance(raw_internal_oidc_token, str)
                else None
            )
            oidc_token = get_oidc_token_for_request(
                has_public_oidc=bool(self.headers.get(OIDC_HEADER_NAME)),
                internal_oidc_token=internal_oidc_token,
            )
            if oidc_token:
                self.headers[OIDC_HEADER_NAME] = oidc_token
            with contextlib.suppress(Exception):
                del self.headers[INTERNAL_OIDC_HEADER_NAME]
            strip_internal_headers(self.headers)

            sc_no_header_leak = bool(
                self.headers.get(SC_NO_HEADER_LEAK_HEADER),
            )
            set_runtime_cache_from_http_headers(self.headers)
            for sc_header in SC_HEADERS_ALWAYS_STRIP:
                with contextlib.suppress(Exception):
                    del self.headers[sc_header]
            if sc_no_header_leak:
                for sc_header in SC_HEADERS_STRIP_ON_NO_LEAK:
                    with contextlib.suppress(Exception):
                        del self.headers[sc_header]

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

            self._vc_end_token = storage.set(
                {
                    "invocationId": invocation_id,
                    "requestId": request_id,
                }
            )
            deadline_token = deadline.set_deadline(deadline_value)
            set_vercel_headers_from_http_headers(self.headers)
            self._vc_wait_until = begin_wait_until()

            try:
                self.handle_request()  # type: ignore[attr-defined]
            finally:
                try:
                    self._vc_fire_end_once()
                finally:
                    # For a WebSocket upgrade _vc_fire_end_once runs at the
                    # 101 handshake while this thread keeps driving the
                    # socket. Keep the deadline readable until the handler
                    # returns, mirroring Node: the platform still enforces
                    # maxDuration on the invocation.
                    deadline.reset_deadline(deadline_token)

    try:
        app_name, app_obj = resolve_app(
            __vc_module, _entrypoint_modname, _entrypoint_varname
        )
    except RuntimeError as exc:
        _fatal(str(exc))

    handler_class: type[BaseHTTPRequestHandler] | None = None
    http_port: int | None = None
    run_server: Callable[[], None] | None = None
    shutdown_server: Callable[[], None] | None = None
    # True when the function is running on hive (foh).
    is_foh = False

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

        handler_class = Handler

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
                    try:
                        body = read_wsgi_request_body(self.rfile, self.headers)
                    except ValueError as exc:
                        self.log_error("invalid request body: %s", exc)
                        self.send_error(400)
                        return
                    env: dict[str, Any] = {
                        "CONTENT_LENGTH": str(len(body)),
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
                        "wsgi.input": BytesIO(body),
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
                        # Hop-by-hop; body is already de-chunked (PEP 3333).
                        if k.lower() == "transfer-encoding":
                            continue
                        env["HTTP_" + k.replace("-", "_").upper()] = v

                    if attach_wsgi_websocket(
                        env,
                        self.headers,
                        self.connection,
                        self._vc_fire_end_once,
                    ):
                        # The hijacked connection cannot be reused for further
                        # requests once the upgrade completes.
                        self.close_connection = True

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

            handler_class = Handler

        else:
            # ASGI: Run with Uvicorn for proper lifespan
            # and protocol handling
            from vercel_runtime._vendor import uvicorn

            asgi_user_app = detection_result[1]
            asgi_app = ASGIMiddleware(asgi_user_app)

            # Pre-bind a socket to obtain an ephemeral port for IPC announcement
            sock = socket.socket(
                socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP
            )
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(("127.0.0.1", 0))
            sock.listen(2048)
            # `server-started` needs an `int`, and `http_port` is `int | None`.
            listen_port: int = sock.getsockname()[1]
            http_port = listen_port

            config = uvicorn.Config(
                app=asgi_app,
                lifespan="auto",
                access_log=False,
                log_config=None,
                log_level="warning",
            )

            # Only Hive waits for lifespan startup. Lambda counts the time
            # until `server-started` against its Init phase budget, so
            # elsewhere send it before lifespan startup as before.
            is_foh = os.environ.get("VERCEL_IPC_PATH") == _HIVE_IPC_PATH
            uvicorn_server: uvicorn.Server
            if is_foh:
                from vercel_runtime import asgi_server

                uvicorn_server = asgi_server.ReadyAnnouncingServer(
                    config,
                    on_ready=functools.partial(
                        _send_server_started, listen_port
                    ),
                    on_startup_failed=functools.partial(
                        _fatal,
                        "could not start ASGI application: "
                        "lifespan startup failed",
                    ),
                )
            else:
                uvicorn_server = uvicorn.Server(config)
            run_server = functools.partial(uvicorn_server.run, sockets=[sock])

            def shutdown_uvicorn_server() -> None:
                uvicorn_server.should_exit = True

            shutdown_server = shutdown_uvicorn_server

    if handler_class is not None:
        # Explicit handler and WSGI cases - run a server from the handler
        http_server = ThreadingHTTPServer(("127.0.0.1", 0), handler_class)
        http_port = http_server.server_address[1]
        run_server = http_server.serve_forever
        shutdown_server = http_server.shutdown
    else:
        # ASGI: server already set up
        assert http_port and run_server


if "VERCEL_IPC_PATH" in os.environ:
    if not is_foh:
        _send_server_started(http_port)
    run_server()
else:
    # For the vc_handler version, run the server in a thread and have
    # vc_handler proxy to it.

    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    def _finalize() -> None:
        assert shutdown_server
        shutdown_server()
        server_thread.join(timeout=15.0)

    atexit.register(_finalize)

    def vc_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
        payload = json.loads(event["body"])
        header_pairs = normalize_event_header_pairs(payload.get("headers", {}))
        header_names = {key.lower() for key, _ in header_pairs}

        body = payload.get("body")
        if payload.get("encoding") == "base64":
            body = base64.b64decode(body)
        elif isinstance(body, str):
            body = body.encode()

        connection = http.client.HTTPConnection("127.0.0.1", http_port)
        try:
            connection.putrequest(
                payload["method"],
                payload["path"],
                skip_host="host" in header_names,
                skip_accept_encoding="accept-encoding" in header_names,
            )
            for key, value in header_pairs:
                connection.putheader(key, value)
            if (
                "content-length" not in header_names
                and "transfer-encoding" not in header_names
            ):
                connection.putheader("content-length", str(len(body or b"")))
            connection.endheaders(body)

            response = connection.getresponse()
            response_body = response.read()
            result: dict[str, Any] = {
                "statusCode": response.status,
                "headers": format_headers(response.headers),
            }
            try:
                result["body"] = response_body.decode()
            except UnicodeDecodeError:
                result["body"] = base64.b64encode(response_body).decode()
                result["encoding"] = "base64"
            return result
        finally:
            connection.close()
