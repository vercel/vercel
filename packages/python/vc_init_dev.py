import sys
import os
import inspect
import mimetypes
from importlib import import_module
from os import path as _p
from typing import Callable, Any


# Optional StaticFiles import for ASGI; tolerate missing deps.
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


USER_MODULE = "__VC_DEV_MODULE_PATH__"
PUBLIC_DIR = "public"


# ANSI coloring. Respect NO_COLOR environment variable.
_NO_COLOR = "NO_COLOR" in os.environ
_RESET = "\x1b[0m"
_YELLOW = "\x1b[33m"
_GREEN = "\x1b[32m"
_RED = "\x1b[31m"


def _color(text: str, code: str) -> str:
    if _NO_COLOR:
        return text
    return f"{code}{text}{_RESET}"


def _load_user_app():
    mod = import_module(USER_MODULE)
    app = getattr(mod, "app", None)
    if app is None:
        raise RuntimeError(
            f"Missing 'app' in module '{USER_MODULE}'. "
            "Define `app = ...` (ASGI or WSGI app)."
        )
    return app


def _is_safe_file(base_dir: str, target: str) -> bool:
    try:
        base = _p.realpath(base_dir)
        tgt = _p.realpath(target)
        return (tgt == base or tgt.startswith(base + os.sep)) and _p.isfile(tgt)
    except Exception:
        return False


def _static_wsgi_app(environ, start_response):
    def _404(start_response: Callable[[str, list[tuple[str, str]]], None]) -> list[bytes]:
        start_response(
            "404 Not Found", [("Content-Type", "text/plain; charset=utf-8")]
        )
        return [b"Not Found"]

    # Only handle GET/HEAD requests for static assets
    if environ.get("REQUEST_METHOD", "GET") not in ("GET", "HEAD"):
        return _404(start_response)

    req_path = environ.get("PATH_INFO", "/") or "/"
    safe = _p.normpath(req_path).lstrip("/")
    full = _p.join(PUBLIC_DIR, safe)
    if not _is_safe_file(PUBLIC_DIR, full):
        return _404(start_response)

    ctype, _encoding = mimetypes.guess_type(full)
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
        return _404(start_response)


def _wrap_wsgi_app(user_app: Callable[[dict, Callable[[str, list[tuple[str, str]]], None]], Any]):
    """Return a WSGI app that serves static files first, then delegates."""

    def _combined_app(environ, start_response):
        # Try static first; if 200 then forward its response, otherwise delegate.
        captured_status = ""
        captured_headers = tuple()
        body_chunks = []

        def capture_start_response(status, headers, exc_info=None):  # type: ignore[no-redef]
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
            writer = start_response(captured_status, list(captured_headers))
            for chunk in body_chunks:
                writer(chunk)
            return result

        # Otherwise, delegate to user's WSGI app
        return user_app(environ, start_response)

    return _combined_app


def _wrap_asgi_app(user_app):
    """Return an ASGI app that serves static files first, then delegates."""

    # Prefer a callable app.asgi when available; some frameworks expose a boolean here.
    cand = getattr(user_app, "asgi", None)
    user_asgi_app = cand if callable(cand) else user_app

    static_app = None
    if StaticFiles is not None:
        try:
            try:
                static_app = StaticFiles(directory=PUBLIC_DIR, check_dir=False)
            except TypeError:
                # Older Starlette without check_dir parameter
                static_app = StaticFiles(directory=PUBLIC_DIR)
        except Exception:
            static_app = None

    async def app(scope, receive, send):
        if static_app is not None and scope.get("type") == "http":
            req_path = scope.get("path", "/") or "/"
            safe = _p.normpath(req_path).lstrip("/")
            full = _p.join(PUBLIC_DIR, safe)
            try:
                base = _p.realpath(PUBLIC_DIR)
                target = _p.realpath(full)
                if (target == base or target.startswith(base + _p.sep)) and _p.isfile(
                    target
                ):
                    await static_app(scope, receive, send)
                    return
            except Exception:
                pass
        await user_asgi_app(scope, receive, send)

    return app


def _is_asgi_app(candidate) -> bool:
    """Heuristic to detect ASGI apps, mirroring vc_init.py semantics."""

    # Prefer explicit .asgi attribute when callable.
    cand = getattr(candidate, "asgi", None)
    if callable(cand):
        return True

    try:
        if inspect.iscoroutinefunction(candidate):
            return True
        call = getattr(candidate, "__call__", None)
        if call is not None and inspect.iscoroutinefunction(call):
            return True
    except Exception:
        pass
    return False


USER_APP = _load_user_app()

if _is_asgi_app(USER_APP):
    APP_KIND = "asgi"
    app = _wrap_asgi_app(USER_APP)
else:
    APP_KIND = "wsgi"
    app = _wrap_wsgi_app(USER_APP)


def _serve_asgi_app(host: str):
    try:
        import uvicorn  # type: ignore

        uvicorn.run(app, host=host, port=0, use_colors=True)
    except Exception:
        try:
            import asyncio
            from hypercorn.config import Config  # type: ignore
            from hypercorn.asyncio import serve  # type: ignore

            config = Config()
            config.bind = [f"{host}:0"]

            async def _run():
                await serve(app, config)

            asyncio.run(_run())
        except Exception:
            print(
                _color(
                    'No ASGI server found. Please install either "uvicorn" or '
                    '"hypercorn" (e.g. "pip install uvicorn").',
                    _RED,
                ),
                file=sys.stderr,
            )
            sys.exit(1)


def _serve_wsgi_app(host: str):
    try:
        from werkzeug.serving import run_simple  # type: ignore
        run_simple(host, 0, app, use_reloader=False)
    except Exception:
        print(
            _color(
                "Werkzeug not installed; falling back to wsgiref (no reloader).",
                _YELLOW,
            ),
            file=sys.stderr,
        )
        from wsgiref.simple_server import make_server
        httpd = make_server(host, 0, app)
        port = httpd.server_port
        print(_color(f"Serving on http://{host}:{port}", _GREEN))
        httpd.serve_forever()


def start_dev_server():
    host = "127.0.0.1"
    if APP_KIND == "asgi":
        _serve_asgi_app(host)
    else:
        _serve_wsgi_app(host)


if __name__ == "__main__":
    start_dev_server()
