# Auto-generated template used by vercel dev (Python, ASGI/WSGI)
# Serves static files from PUBLIC_DIR before delegating to the user app.

import sys
import os
import inspect
import logging
import logging.config
from os import path as _p
from importlib import util as _importlib_util
import mimetypes


# Simple ANSI coloring. Respect NO_COLOR environment variable.
_NO_COLOR = "NO_COLOR" in os.environ
_RESET = "\x1b[0m"
_YELLOW = "\x1b[33m"
_GREEN = "\x1b[32m"
_RED = "\x1b[31m"


def _color(text: str, code: str) -> str:
    if _NO_COLOR:
        return text
    return f"{code}{text}{_RESET}"


# Configure logging to output DEBUG-WARNING to the stdout
# and ERROR-CRITICAL to the stderr.


# We need a custom filter for the stdout stream
# so it won't print anything higher than WARNING.
class _MaxLevelFilter(logging.Filter):
    def __init__(self, max_level):
        super().__init__()
        self.max_level = max_level

    def filter(self, record):
        return record.levelno <= self.max_level


def _build_log_config(loggers, _filter_ref=None) -> dict:
    if _filter_ref is None:
        _filter_ref = "vc_init_dev._MaxLevelFilter"

    return {
        "version": 1,
        "disable_existing_loggers": False,
        "filters": {
            "max_warning": {
                "()": _filter_ref,
                "max_level": logging.WARNING,
            }
        },
        "handlers": {
            "stdout": {
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",
                "filters": ["max_warning"],
            },
            "stderr": {
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stderr",
                "level": "ERROR",
            },
        },
        "loggers": loggers,
        "root": {
            "handlers": ["stdout", "stderr"],
            "level": "INFO",
        },
    }


def _setup_server_log_routing(logger_name=None):
    loggers = {}

    if logger_name:
        loggers[logger_name] = {
            "handlers": ["stdout", "stderr"],
            "level": "INFO",
            "propagate": False,
        }

    logging.config.dictConfig(
        _build_log_config(
            loggers=loggers,
            _filter_ref=_MaxLevelFilter,
        ),
    )


def _build_uvicorn_log_config(default_fmt=None, access_fmt=None) -> dict:
    try:
        from uvicorn.config import LOGGING_CONFIG  # type: ignore

        uvicorn_fmts = LOGGING_CONFIG["formatters"]
    except ImportError:
        uvicorn_fmts = {
            "default": {
                "()": "uvicorn.logging.DefaultFormatter",
                "fmt": "%(levelprefix)s %(message)s",
                "use_colors": None,
            },
            "access": {
                "()": "uvicorn.logging.AccessFormatter",
                "fmt": '%(levelprefix)s %(client_addr)s - "%(request_line)s" %(status_code)s',
            },
        }

    cfg = _build_log_config(
        loggers={
            "uvicorn": {
                "handlers": ["stdout", "stderr"],
                "level": "INFO",
                "propagate": False,
            },
            "uvicorn.error": {"level": "INFO"},
            "uvicorn.access": {
                "handlers": ["access"],
                "level": "INFO",
                "propagate": False,
            },
        },
    )

    if default_fmt is None:
        default_fmt = {**uvicorn_fmts["default"], "use_colors": not _NO_COLOR}

    if access_fmt is None:
        access_fmt = {**uvicorn_fmts["access"], "use_colors": not _NO_COLOR}

    cfg["formatters"] = {"default": default_fmt, "access": access_fmt}
    cfg["handlers"]["stdout"]["formatter"] = "default"
    cfg["handlers"]["stderr"]["formatter"] = "default"
    cfg["handlers"]["access"] = {
        "class": "logging.StreamHandler",
        "stream": "ext://sys.stdout",
        "formatter": "access",
    }

    return cfg


def _build_hypercorn_log_config():
    return _build_log_config(
        loggers={
            "hypercorn.error": {
                "handlers": ["stdout", "stderr"],
                "level": "INFO",
                "propagate": False,
            },
            "hypercorn.access": {
                "handlers": ["stdout"],
                "level": "INFO",
                "propagate": False,
            },
        },
    )


def _patch_fastapi_cli_log_config():
    try:
        import fastapi_cli.utils.cli as _fcli  # type: ignore
        import fastapi_cli.cli as _fcli_cli  # type: ignore

        _orig_get_config = _fcli.get_uvicorn_log_config  # to ensure it's there
        _fcli_cli.get_uvicorn_log_config  # to ensure it's there
    except (ImportError, AttributeError):
        return

    def _get_routed_config():
        orig = _orig_get_config()
        return _build_uvicorn_log_config(
            default_fmt={
                "()": "fastapi_cli.utils.cli.CustomFormatter",
                "fmt": orig["formatters"]["default"].get(
                    "fmt", "%(levelprefix)s %(message)s"
                ),
                "use_colors": orig["formatters"]["default"].get("use_colors"),
            },
            access_fmt={
                "()": "fastapi_cli.utils.cli.CustomFormatter",
                "fmt": orig["formatters"]["access"].get(
                    "fmt",
                    "%(levelprefix)s %(client_addr)s - '%(request_line)s' %(status_code)s",
                ),
            },
        )

    _fcli.get_uvicorn_log_config = _get_routed_config
    # we need to patch the local binding as well
    _fcli_cli.get_uvicorn_log_config = _get_routed_config


def _normalize_service_route_prefix(raw_prefix):
    if not raw_prefix:
        return ""

    prefix = raw_prefix.strip()
    if not prefix:
        return ""

    if not prefix.startswith("/"):
        prefix = f"/{prefix}"

    return "" if prefix == "/" else prefix.rstrip("/")


def _is_service_route_prefix_strip_enabled():
    raw = os.environ.get("VERCEL_SERVICE_ROUTE_PREFIX_STRIP")
    if not raw:
        return False
    return raw.lower() in ("1", "true")


_SERVICE_ROUTE_PREFIX = (
    _normalize_service_route_prefix(os.environ.get("VERCEL_SERVICE_ROUTE_PREFIX"))
    if _is_service_route_prefix_strip_enabled()
    else ""
)


def _strip_service_route_prefix(path_value):
    if not path_value:
        path_value = "/"
    elif not path_value.startswith("/"):
        path_value = f"/{path_value}"

    prefix = _SERVICE_ROUTE_PREFIX
    if not prefix:
        return path_value, ""

    if path_value == prefix:
        return "/", prefix

    if path_value.startswith(f"{prefix}/"):
        stripped = path_value[len(prefix) :]
        return stripped if stripped else "/", prefix

    return path_value, ""


# Pre-configure the root logger before user module import so that any log
# calls emitted at import time are routed to stdout/stderr correctly.
_setup_server_log_routing()


# ASGI/WSGI app detection
_MODULE_NAME = "__VC_DEV_MODULE_NAME__"
_ENTRY_ABS = "__VC_DEV_ENTRY_ABS__"

# Import user module by file path, matching vc_init.py's approach.
# https://docs.python.org/3/library/importlib.html#importing-a-source-file-directly
_spec = _importlib_util.spec_from_file_location(_MODULE_NAME, _ENTRY_ABS)
if _spec is None or _spec.loader is None:
    raise RuntimeError(
        f"Could not load module spec for '{_MODULE_NAME}' at {_ENTRY_ABS}"
    )
_mod = _importlib_util.module_from_spec(_spec)
sys.modules[_MODULE_NAME] = _mod
_spec.loader.exec_module(_mod)

_user_app_name = (
    "app"
    if hasattr(_mod, "app")
    else "application"
    if hasattr(_mod, "application")
    else None
)
if _user_app_name is None:
    raise RuntimeError(
        f"Missing 'app' or 'application' in module '{_MODULE_NAME}'. "
        f"Define `app = ...` or `application = ...` in your entrypoint."
    )

_user_app = getattr(_mod, _user_app_name, None)


def _get_positional_param_count(obj):
    try:
        sig = inspect.signature(obj)
        return sum(
            1
            for p in sig.parameters.values()
            if p.default is inspect.Parameter.empty
            and p.kind
            in (
                inspect.Parameter.POSITIONAL_ONLY,
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
            )
        )
    except (ValueError, TypeError):
        return None


def _detect_app_type(app_obj):
    # try .asgi attribute if it's available and is callable
    asgi_attr = getattr(app_obj, "asgi", None)
    if asgi_attr is not None and callable(asgi_attr):
        return "asgi", asgi_attr

    # For async detection, check the object itself first (works for plain
    # functions/methods).
    # For class instances iscoroutinefunction(obj) is False,
    # so fall back to __call__.
    is_async = inspect.iscoroutinefunction(app_obj)
    if not is_async:
        call_method = getattr(app_obj, "__call__", None)
        if call_method is not None:
            is_async = inspect.iscoroutinefunction(call_method)

    # inspect.signature() already delegates to __call__ for class instances,
    # and works directly on plain functions, so always inspect app_obj.
    param_count = _get_positional_param_count(app_obj)

    # ASGI (scope, receive, send)
    if is_async and param_count == 3:
        return "asgi", app_obj

    # WSGI (environ, start_response)
    if param_count == 2:
        return "wsgi", app_obj

    print(
        _color(
            f"Could not determine the application interface for '{_MODULE_NAME}:{_user_app_name}'\n"
            f"Expected either:\n"
            f"  - An ASGI app: async callable(scope, receive, send)\n"
            f"  - A WSGI app: callable(environ, start_response)",
            _RED,
        ),
        file=sys.stderr,
    )
    sys.exit(1)


app_type, resolved_app = _detect_app_type(_user_app)

if app_type == "asgi":
    _asgi_app = resolved_app
    _wsgi_app = None
else:
    _wsgi_app = resolved_app
    _asgi_app = None

PUBLIC_DIR = "public"

# Prepare ASGI app

# Optional StaticFiles import; tolerate missing deps
StaticFiles = None
try:
    from fastapi.staticfiles import StaticFiles as _SF  # type: ignore

    StaticFiles = _SF
except Exception:
    try:
        from starlette.staticfiles import StaticFiles as _SF  # type: ignore

        StaticFiles = _SF
    except Exception:
        StaticFiles = None

# Prepare static files app (if starlette/fastapi installed)
_static_app = None
if StaticFiles is not None:
    try:
        try:
            _static_app = StaticFiles(directory=PUBLIC_DIR, check_dir=False)
        except TypeError:
            _static_app = StaticFiles(directory=PUBLIC_DIR)
    except Exception:
        _static_app = None


def _apply_service_route_prefix_to_scope(scope):
    path_value, matched_prefix = _strip_service_route_prefix(scope.get("path", "/"))
    if not matched_prefix:
        return scope

    updated_scope = dict(scope)
    updated_scope["path"] = path_value

    raw_path = scope.get("raw_path")
    if isinstance(raw_path, (bytes, bytearray)):
        try:
            decoded = bytes(raw_path).decode("utf-8", "surrogateescape")
            stripped_raw, _ = _strip_service_route_prefix(decoded)
            updated_scope["raw_path"] = stripped_raw.encode("utf-8", "surrogateescape")
        except Exception:
            pass

    existing_root = scope.get("root_path", "") or ""
    if existing_root and existing_root != "/":
        existing_root = existing_root.rstrip("/")
    else:
        existing_root = ""
    updated_scope["root_path"] = f"{existing_root}{matched_prefix}"
    return updated_scope


async def asgi_app(scope, receive, send):
    effective_scope = _apply_service_route_prefix_to_scope(scope)

    if _static_app is not None and effective_scope.get("type") == "http":
        req_path = effective_scope.get("path", "/") or "/"
        safe = _p.normpath(req_path).lstrip("/")
        full = _p.join(PUBLIC_DIR, safe)
        try:
            base = _p.realpath(PUBLIC_DIR)
            target = _p.realpath(full)
            if (target == base or target.startswith(base + _p.sep)) and _p.isfile(
                target
            ):
                await _static_app(effective_scope, receive, send)
                return
        except Exception:
            pass
    await _asgi_app(effective_scope, receive, send)


# Prepare WSGI


def _is_safe_file(base_dir: str, target: str) -> bool:
    try:
        base = _p.realpath(base_dir)
        tgt = _p.realpath(target)
        return (tgt == base or tgt.startswith(base + os.sep)) and _p.isfile(tgt)
    except Exception:
        return False


def _static_wsgi_app(environ, start_response):
    # Only handle GET/HEAD requests for static assets
    if environ.get("REQUEST_METHOD", "GET") not in ("GET", "HEAD"):
        return _not_found(start_response)

    req_path = environ.get("PATH_INFO", "/") or "/"
    safe = _p.normpath(req_path).lstrip("/")
    full = _p.join(PUBLIC_DIR, safe)
    if not _is_safe_file(PUBLIC_DIR, full):
        return _not_found(start_response)

    ctype, _ = mimetypes.guess_type(full)
    headers = [("Content-Type", ctype or "application/octet-stream")]
    try:
        # For HEAD requests, send headers only
        if environ.get("REQUEST_METHOD") == "HEAD":
            start_response("200 OK", headers)
            return []
        with open(full, "rb") as f:
            data = f.read()
        headers.append(("Content-Length", str(len(data))))
        start_response("200 OK", headers)
        return [data]
    except Exception:
        return _not_found(start_response)


def _not_found(start_response):
    start_response("404 Not Found", [("Content-Type", "text/plain; charset=utf-8")])
    return [b"Not Found"]


def wsgi_app(environ, start_response):
    path_info, matched_prefix = _strip_service_route_prefix(
        environ.get("PATH_INFO", "/") or "/"
    )
    environ["PATH_INFO"] = path_info
    if matched_prefix:
        script_name = environ.get("SCRIPT_NAME", "") or ""
        if script_name and script_name != "/":
            script_name = script_name.rstrip("/")
        else:
            script_name = ""
        environ["SCRIPT_NAME"] = f"{script_name}{matched_prefix}"

    # Try static first; if 404 then delegate to user app
    captured_status = ""
    captured_headers = tuple()
    body_chunks = []

    def capture_start_response(status, headers, exc_info=None):
        nonlocal captured_status, captured_headers
        captured_status = status
        captured_headers = tuple(headers)

        # Return a writer that buffers the body
        def write(chunk: bytes):
            body_chunks.append(chunk)

        return write

    result = _static_wsgi_app(environ, capture_start_response)
    # If static handler produced 200, forward its response
    if captured_status.startswith("200 "):
        # Send headers and any chunks collected
        writer = start_response(captured_status, list(captured_headers))
        for chunk in body_chunks:
            writer(chunk)
        return result

    # Otherwise, delegate to user's WSGI app
    return _wsgi_app(environ, start_response)


# Run dev server

if __name__ == "__main__":
    # Development runner
    #
    # For WSGI: prefer Werkzeug, but fall back to stdlib wsgiref.
    # For ASGI: prefer FastAPI CLI (dev command), then uvicorn, then hypercorn.
    #
    # The port is provided by the caller via the PORT environment variable.

    host = "127.0.0.1"
    _raw_port = os.environ.get("PORT")
    if not _raw_port:
        print(
            _color("PORT environment variable is required.", _RED),
            file=sys.stderr,
        )
        sys.exit(1)
    port = int(_raw_port)

    if app_type == "wsgi":
        try:
            from werkzeug.serving import run_simple  # type: ignore

            _setup_server_log_routing("werkzeug")
            run_simple(host, port, wsgi_app, use_reloader=True, threaded=True)
        except Exception:
            print(
                _color(
                    "Werkzeug not installed; falling back to wsgiref (no reloader).",
                    _YELLOW,
                ),
                file=sys.stderr,
            )
            from wsgiref.simple_server import make_server

            httpd = make_server(host, port, wsgi_app)
            print(_color(f"Serving on http://{host}:{port}", _GREEN))
            httpd.serve_forever()
    else:
        try:
            from fastapi_cli.cli import dev as fastapi_dev  # type: ignore
        except ImportError:
            fastapi_dev = None

        if fastapi_dev is not None:
            _patch_fastapi_cli_log_config()
            fastapi_dev(
                entrypoint="vc_init_dev:asgi_app", host=host, port=port, reload=True
            )
            sys.exit(0)

        try:
            import uvicorn  # type: ignore

            uvicorn.run(
                "vc_init_dev:asgi_app",
                host=host,
                port=port,
                use_colors=True,
                reload=True,
                log_config=_build_uvicorn_log_config(),
            )
        except Exception:
            try:
                import asyncio
                from hypercorn.config import Config  # type: ignore
                from hypercorn.asyncio import serve  # type: ignore

                config = Config()
                config.bind = [f"{host}:{port}"]
                config.use_reloader = True
                config.logconfig_dict = _build_hypercorn_log_config()

                async def _run():
                    await serve(asgi_app, config)

                asyncio.run(_run())
            except Exception:
                print(
                    _color(
                        'No ASGI server found. Please install either "uvicorn" or "hypercorn" (e.g. "pip install uvicorn").',
                        _RED,
                    ),
                    file=sys.stderr,
                )
                sys.exit(1)
