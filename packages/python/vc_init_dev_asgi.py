# Auto-generated template used by vercel dev (Python, ASGI)
# Serves static files from PUBLIC_DIR before delegating to the user ASGI app.
import sys
import os
from os import path as _p
from importlib import import_module


# Simple ANSI coloring. Respect NO_COLOR environment variable.
_NO_COLOR = 'NO_COLOR' in os.environ
_RESET = "\x1b[0m"
_YELLOW = "\x1b[33m"
_GREEN = "\x1b[32m"
_RED = "\x1b[31m"

def _color(text: str, code: str) -> str:
    if _NO_COLOR:
        return text
    return f"{code}{text}{_RESET}"


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

# Prefer a callable app.asgi when available; some frameworks expose a boolean here
_CAND = getattr(_app, 'asgi', None)
USER_ASGI_APP = _CAND if callable(_CAND) else _app

PUBLIC_DIR = 'public'


def _normalize_service_route_prefix(raw_prefix):
    if not raw_prefix:
        return ''

    prefix = raw_prefix.strip()
    if not prefix:
        return ''

    if not prefix.startswith('/'):
        prefix = f'/{prefix}'

    return '' if prefix == '/' else prefix.rstrip('/')


def _is_service_route_prefix_strip_enabled():
    raw = os.environ.get('VERCEL_SERVICE_ROUTE_PREFIX_STRIP')
    if not raw:
        return False
    return raw.lower() in ('1', 'true')


_SERVICE_ROUTE_PREFIX = (
    _normalize_service_route_prefix(os.environ.get('VERCEL_SERVICE_ROUTE_PREFIX'))
    if _is_service_route_prefix_strip_enabled()
    else ''
)


def _strip_service_route_prefix(path_value):
    if not path_value:
        path_value = '/'
    elif not path_value.startswith('/'):
        path_value = f'/{path_value}'

    prefix = _SERVICE_ROUTE_PREFIX
    if not prefix:
        return path_value, ''

    if path_value == prefix:
        return '/', prefix

    if path_value.startswith(f'{prefix}/'):
        stripped = path_value[len(prefix):]
        return stripped if stripped else '/', prefix

    return path_value, ''


def _apply_service_route_prefix_to_scope(scope):
    path_value, matched_prefix = _strip_service_route_prefix(scope.get('path', '/'))
    if not matched_prefix:
        return scope

    updated_scope = dict(scope)
    updated_scope['path'] = path_value

    raw_path = scope.get('raw_path')
    if isinstance(raw_path, (bytes, bytearray)):
        try:
            decoded = bytes(raw_path).decode('utf-8', 'surrogateescape')
            stripped_raw, _ = _strip_service_route_prefix(decoded)
            updated_scope['raw_path'] = stripped_raw.encode(
                'utf-8', 'surrogateescape'
            )
        except Exception:
            pass

    existing_root = scope.get('root_path', '') or ''
    if existing_root and existing_root != '/':
        existing_root = existing_root.rstrip('/')
    else:
        existing_root = ''
    updated_scope['root_path'] = f'{existing_root}{matched_prefix}'
    return updated_scope

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
    effective_scope = _apply_service_route_prefix_to_scope(scope)

    if static_app is not None and effective_scope.get('type') == 'http':
        req_path = effective_scope.get('path', '/') or '/'
        safe = _p.normpath(req_path).lstrip('/')
        full = _p.join(PUBLIC_DIR, safe)
        try:
            base = _p.realpath(PUBLIC_DIR)
            target = _p.realpath(full)
            if (target == base or target.startswith(base + _p.sep)) and _p.isfile(target):
                await static_app(effective_scope, receive, send)
                return
        except Exception:
            pass
    await USER_ASGI_APP(effective_scope, receive, send)


if __name__ == '__main__':
    # Development runner for ASGI: prefer fastapi dev, then uvicorn, then hypercorn.
    # Bind to localhost on an ephemeral port and emit a recognizable log line
    # so the caller can detect the bound port.
    host = '127.0.0.1'

    try:
        from fastapi_cli.cli import dev
    except ImportError:
        dev = None

    if dev is not None:
        dev(entrypoint='vc_init_dev_asgi:app', host=host, port=0, reload=True)
        sys.exit(0)

    try:
        import uvicorn
        uvicorn.run('vc_init_dev_asgi:app', host=host, port=0, use_colors=True, reload=True)
    except Exception:
        try:
            import asyncio
            from hypercorn.config import Config
            from hypercorn.asyncio import serve

            config = Config()
            config.bind = [f'{host}:0']

            async def _run():
                await serve(app, config)

            asyncio.run(_run())
        except Exception:
            print(_color('No ASGI server found. Please install either "uvicorn" or "hypercorn" (e.g. "pip install uvicorn").', _RED), file=sys.stderr)
            sys.exit(1)
