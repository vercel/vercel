# Auto-generated template used by vercel dev (Python, ASGI)
# Serves static files from PUBLIC_DIR before delegating to the user ASGI app.
from importlib import import_module
import os
from os import path as _p

# Optional StaticFiles import; tolerate missing deps
StaticFiles = None
try:
    from fastapi.staticfiles import StaticFiles as _SF
    StaticFiles = _SF
except Exception:
    try:
        from starlette.staticfiles import StaticFiles as _SF
        StaticFiles = _SF
    except Exception:
        StaticFiles = None

USER_MODULE = "__VC_DEV_MODULE_PATH__"
_mod = import_module(USER_MODULE)
_app = getattr(_mod, 'app', None)
if _app is None:
    raise RuntimeError(
        f"Missing 'app' in module '{USER_MODULE}'. Define `app = ...` (ASGI app)."
    )

# Sanic compatibility: prefer `app.asgi` when available
USER_ASGI_APP = getattr(_app, 'asgi', _app)

PUBLIC_DIR = 'public'

# Prepare static files app (if starlette/fastapi installed)
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
    if static_app is not None and scope.get('type') == 'http':
        req_path = scope.get('path', '/') or '/'
        safe = _p.normpath(req_path).lstrip('/')
        full = _p.join(PUBLIC_DIR, safe)
        try:
            base = _p.realpath(PUBLIC_DIR)
            target = _p.realpath(full)
            if (target == base or target.startswith(base + _p.sep)) and _p.isfile(target):
                await static_app(scope, receive, send)
                return
        except Exception:
            pass
    await USER_ASGI_APP(scope, receive, send)
