from __future__ import annotations

import logging
import logging.config
import mimetypes
import os
import sys
from typing import TYPE_CHECKING, Any, cast

from vercel_runtime._vendor import uvicorn as vendored_uvicorn
from vercel_runtime._vendor.uvicorn.config import (
    LOGGING_CONFIG as UVICORN_LOGGING_CONFIG,
)
from vercel_runtime._vendor.werkzeug.serving import run_simple
from vercel_runtime.crons import bootstrap_cron_service_app, is_cron_service
from vercel_runtime.resolver import detect_app_type, import_module, resolve_app
from vercel_runtime.routing import (
    apply_service_route_prefix_to_asgi_scope,
    strip_service_route_prefix,
)
from vercel_runtime.workers import (
    bootstrap_worker_service_app,
    is_worker_service,
    prepare_celery_environment,
)

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable
    from wsgiref.types import WSGIApplication

    from vercel_runtime.asgi import ASGI

_NO_COLOR = "NO_COLOR" in os.environ

_log = logging.getLogger("vercel.dev")


# Used to split DEBUG-WARNING -> stdout and ERROR-CRITICAL -> stderr
class _MaxLevelFilter(logging.Filter):
    def __init__(self, max_level: int) -> None:
        super().__init__()
        self.max_level = max_level

    def filter(self, record: logging.LogRecord) -> bool:
        return record.levelno <= self.max_level


def _build_log_config(
    loggers: dict[str, Any],
    _filter_ref: object | None = None,
) -> dict[str, Any]:
    if _filter_ref is None:
        _filter_ref = "vercel_runtime.dev._MaxLevelFilter"

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


def _setup_server_log_routing(logger_name: str | None = None) -> None:
    loggers: dict[str, Any] = {}

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


def _build_uvicorn_log_config(
    default_fmt: dict[str, Any] | None = None,
    access_fmt: dict[str, Any] | None = None,
) -> dict[str, Any]:
    uvicorn_fmts: dict[str, Any] = UVICORN_LOGGING_CONFIG["formatters"]

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
        default_fmt = {
            **uvicorn_fmts["default"],
            "()": "vercel_runtime._vendor.uvicorn.logging.DefaultFormatter",
            "use_colors": not _NO_COLOR,
        }

    if access_fmt is None:
        access_fmt = {
            **uvicorn_fmts["access"],
            "()": "vercel_runtime._vendor.uvicorn.logging.AccessFormatter",
            "use_colors": not _NO_COLOR,
        }

    cfg["formatters"] = {"default": default_fmt, "access": access_fmt}
    cfg["handlers"]["stdout"]["formatter"] = "default"
    cfg["handlers"]["stderr"]["formatter"] = "default"
    cfg["handlers"]["access"] = {
        "class": "logging.StreamHandler",
        "stream": "ext://sys.stdout",
        "formatter": "access",
    }

    return cfg


def _patch_fastapi_cli_log_config() -> None:
    try:
        import fastapi_cli.cli as _fcli_cli  # type: ignore[import-not-found]  # noqa: PLC0415  # pyright: ignore[reportMissingImports]
        import fastapi_cli.utils.cli as _fcli  # type: ignore[import-not-found]  # noqa: PLC0415  # pyright: ignore[reportMissingImports]

        orig_get_config = cast(
            "Callable[[], dict[str, Any]]",
            _fcli.get_uvicorn_log_config,  # pyright: ignore[reportUnknownMemberType]
        )

        # we want to ensure that attr exists
        # because we're going to patch it as well
        _fcli_cli.get_uvicorn_log_config  # noqa: B018  # pyright: ignore[reportUnknownMemberType]
    except (ImportError, AttributeError):
        return

    def _get_routed_config() -> dict[str, Any]:
        orig = orig_get_config()
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
                    "%(levelprefix)s %(client_addr)s - "
                    "'%(request_line)s' %(status_code)s",
                ),
            },
        )

    _fcli.get_uvicorn_log_config = _get_routed_config
    _fcli_cli.get_uvicorn_log_config = _get_routed_config


PUBLIC_DIR = "public"


def _build_static_asgi_app() -> ASGI | None:
    static_files_cls: type[Any] | None = None
    try:
        from fastapi.staticfiles import (  # type: ignore[import-not-found]  # noqa: PLC0415  # pyright: ignore[reportMissingImports]
            StaticFiles,  # pyright: ignore[reportUnknownVariableType]
        )

        static_files_cls = StaticFiles  # pyright: ignore[reportUnknownVariableType]
    except Exception:
        try:
            from starlette.staticfiles import (  # type: ignore[import-not-found]  # noqa: PLC0415  # pyright: ignore[reportMissingImports]
                StaticFiles,  # pyright: ignore[reportUnknownVariableType]
            )

            static_files_cls = StaticFiles  # pyright: ignore[reportUnknownVariableType]
        except Exception:
            return None

    if static_files_cls is not None:
        try:
            try:
                return cast(
                    "ASGI",
                    static_files_cls(directory=PUBLIC_DIR, check_dir=False),
                )
            except TypeError:
                return cast("ASGI", static_files_cls(directory=PUBLIC_DIR))
        except Exception:
            return None

    return None


def _is_safe_file(base_dir: str, target: str) -> bool:
    try:
        base = os.path.realpath(base_dir)
        tgt = os.path.realpath(target)
        return (
            tgt == base or tgt.startswith(base + os.sep)
        ) and os.path.isfile(tgt)
    except Exception:
        return False


def _static_wsgi_app(
    environ: dict[str, Any],
    start_response: Callable[..., Any],
) -> list[bytes]:
    if environ.get("REQUEST_METHOD", "GET") not in ("GET", "HEAD"):
        return _not_found(start_response)

    req_path = environ.get("PATH_INFO", "/") or "/"
    safe = os.path.normpath(req_path).lstrip("/")
    full = os.path.join(PUBLIC_DIR, safe)
    if not _is_safe_file(PUBLIC_DIR, full):
        return _not_found(start_response)

    ctype, _ = mimetypes.guess_type(full)
    headers = [("Content-Type", ctype or "application/octet-stream")]
    try:
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


def _not_found(
    start_response: Callable[..., Any],
) -> list[bytes]:
    start_response(
        "404 Not Found",
        [("Content-Type", "text/plain; charset=utf-8")],
    )
    return [b"Not Found"]


static_asgi = _build_static_asgi_app()
_asgi_user_app: ASGI | None = None
_wsgi_user_app: WSGIApplication | None = None


async def asgi_app(
    scope: dict[str, Any],
    receive: Callable[[], Awaitable[Any]],
    send: Callable[[Any], Awaitable[None]],
) -> None:
    effective_scope = dict(scope)
    apply_service_route_prefix_to_asgi_scope(effective_scope)

    if static_asgi is not None and effective_scope.get("type") == "http":
        req_path = effective_scope.get("path", "/") or "/"
        safe = os.path.normpath(req_path).lstrip("/")
        full = os.path.join(PUBLIC_DIR, safe)
        try:
            base = os.path.realpath(PUBLIC_DIR)
            target = os.path.realpath(full)
            if (
                target == base or target.startswith(base + os.path.sep)
            ) and os.path.isfile(target):
                await static_asgi(effective_scope, receive, send)
                return
        except Exception:
            pass

    assert _asgi_user_app is not None
    await _asgi_user_app(effective_scope, receive, send)


def wsgi_app(
    environ: dict[str, Any],
    start_response: Callable[..., Any],
) -> Any:
    path_info, matched_prefix = strip_service_route_prefix(
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
    captured_headers: tuple[tuple[str, str], ...] = ()
    body_chunks: list[bytes] = []

    def capture_start_response(
        status: str,
        headers: list[tuple[str, str]],
        exc_info: Any = None,
    ) -> Callable[[bytes], None]:
        nonlocal captured_status, captured_headers
        captured_status = status
        captured_headers = tuple(headers)

        def write(chunk: bytes) -> None:
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
    assert _wsgi_user_app is not None
    return _wsgi_user_app(environ, start_response)


def _start_wsgi(host: str, port: int) -> None:
    _setup_server_log_routing("werkzeug")
    run_simple(host, port, wsgi_app, use_reloader=True, threaded=True)


def _start_asgi(host: str, port: int) -> None:
    # Prefer user-installed fastapi-cli for web services;
    # cron/worker go straight to uvicorn.
    if not is_cron_service() and not is_worker_service():
        try:
            from fastapi_cli.cli import (  # noqa: PLC0415  # pyright: ignore[reportMissingImports]
                dev as fastapi_dev,  # pyright: ignore[reportUnknownVariableType]
            )

            _patch_fastapi_cli_log_config()
            fastapi_dev(
                entrypoint="vercel_runtime.dev:asgi_app",
                host=host,
                port=port,
                reload=True,
            )
            sys.exit(0)
        except (ImportError, AttributeError):
            pass

    vendored_uvicorn.run(
        "vercel_runtime.dev:asgi_app",
        host=host,
        port=port,
        use_colors=not _NO_COLOR,
        reload=True,
        log_config=_build_uvicorn_log_config(),
    )


def _setup_apps() -> None:
    global _asgi_user_app, _wsgi_user_app  # noqa: PLW0603

    module_name = os.environ["VERCEL_DEV_MODULE_NAME"]
    entry_abs = os.environ["VERCEL_DEV_ENTRY_ABS"]
    framework = os.environ["VERCEL_DEV_FRAMEWORK"]
    variable_name = os.environ.get("VERCEL_DEV_VARIABLE_NAME") or None

    _setup_server_log_routing()
    prepare_celery_environment()

    mod = import_module(module_name, entry_abs)

    if is_cron_service():
        _asgi_user_app = bootstrap_cron_service_app(mod)
        return

    if is_worker_service():
        _asgi_user_app = cast("ASGI", bootstrap_worker_service_app(mod))
        return

    app_name, user_app = resolve_app(mod, module_name, variable_name)
    try:
        result = detect_app_type(user_app, module_name, app_name)
    except RuntimeError:
        _log.exception("could not detect application type")
        sys.exit(1)

    if result[0] == "asgi":
        _asgi_user_app = result[1]
    else:
        wsgi_app = result[1]

        if framework == "django":
            wsgi_app = _wrap_django_static(wsgi_app)

        _wsgi_user_app = wsgi_app


def _wrap_django_static(app: WSGIApplication) -> WSGIApplication:
    # If this is a django app, wrap it with StaticFilesHandler to serve static
    # files. This is necessary because the dev server will not run the full
    # build process (including collectstatic), so static files may not
    # be available depending on the user's configuration.
    #
    # Special cases:
    # - If whitenoise is used, this will override it but that's ok because we
    #   don't need it in the dev server.
    # - If django-storages is used, this will override it but that's ok because
    #   django-storages handles its own upload to some other CDN.
    try:
        from django.contrib.staticfiles.handlers import (  # type: ignore[import-untyped]  # noqa: PLC0415  # pyright: ignore[reportMissingImports]
            StaticFilesHandler,  # pyright: ignore[reportUnknownVariableType]
        )

        return cast("WSGIApplication", StaticFilesHandler(app))
    except ImportError:
        return app


# Setup apps at import time so that servers reloader can pick them up.
if (
    os.environ.get("VERCEL_DEV_MODULE_NAME")
    and os.environ.get("VERCEL_DEV_ENTRY_ABS")
    and os.environ.get("VERCEL_DEV_FRAMEWORK")
):
    _setup_apps()


def main() -> None:
    host = "127.0.0.1"
    raw_port = os.environ.get("PORT")
    if not raw_port:
        _log.error("PORT environment variable is required")
        sys.exit(1)
    port = int(raw_port)

    if _wsgi_user_app is not None:
        _start_wsgi(host, port)
    else:
        _start_asgi(host, port)
