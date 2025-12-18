import io
import re
import ast
import inspect
import importlib.util
from types import ModuleType
from pathlib import Path
from typing import Any, Coroutine, Callable
from http.server import BaseHTTPRequestHandler
from starlette.applications import Starlette
from starlette.routing import BaseRoute, Match, compile_path
from starlette.types import Scope, Receive, Send, ASGIApp
from asgiref.wsgi import WsgiToAsgi


class ASGIRoute(BaseRoute):
    """A route that directly mounts an ASGI app with path parameter support.

    Unlike Starlette's Route (which wraps endpoints) or Mount (which matches prefixes),
    this matches paths using Starlette's path parameter syntax and delegates directly
    to the ASGI app. Preserves streaming, lifespan, and all ASGI capabilities.

    The full request path is passed through to the app, matching how non-consolidated
    Python functions work. Apps should define routes for their full paths (e.g., /api/foo)
    or use catch-all routes.

    Supports path parameters like:
    - /api/users/{id} - matches /api/users/123
    - /api/posts/{slug:path} - matches /api/posts/2024/my-post
    """

    def __init__(self, path: str, app: ASGIApp, name: str | None = None) -> None:
        self.path = path
        self.app = app
        self.name = name
        # Use Starlette's path compilation for parameter matching
        self.path_regex, self.path_format, self.param_convertors = compile_path(path)

    def matches(self, scope: Scope) -> tuple[Match, Scope]:
        if scope["type"] != "http":
            return Match.NONE, {}

        path = scope.get("path", "/")
        match = self.path_regex.match(path)

        if match:
            matched_params = match.groupdict()
            # Convert parameters using registered convertors
            path_params = {}
            for key, value in matched_params.items():
                if key in self.param_convertors:
                    value = self.param_convertors[key].convert(value)
                path_params[key] = value

            return Match.FULL, {"path": path, "path_params": path_params}

        return Match.NONE, {}

    async def handle(self, scope: Scope, receive: Receive, send: Send) -> None:
        await self.app(scope, receive, send)


def file_contains_app_or_handler(path: Path) -> bool:
    """
    Check if a Python file contains or exports:
    - A top-level 'app' callable (e.g., Flask, FastAPI, Sanic apps)
    - A top-level 'handler' class (e.g., BaseHTTPRequestHandler subclass)
    """
    with open(path, "r") as file:
        code = file.read()

    try:
        tree = ast.parse(code)
    except SyntaxError:
        return False

    for node in ast.iter_child_nodes(tree):
        # Check for top-level assignment to 'app'
        # e.g., app = Sanic() or app = Flask(__name__) or app = create_app()
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "app":
                    return True

        # Check for annotated assignment to 'app'
        # e.g., app: Sanic = Sanic()
        if isinstance(node, ast.AnnAssign):
            if isinstance(node.target, ast.Name) and node.target.id == "app":
                return True

        # Check for function named 'app'
        # e.g., def app(environ, start_response): ...
        if isinstance(node, ast.FunctionDef) and node.name == "app":
            return True

        # Check for async function named 'app'
        # e.g., async def app(scope, receive, send): ...
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "app":
            return True

        # Check for import of 'app'
        # e.g., from server import app
        # e.g., from server import application as app
        if isinstance(node, ast.ImportFrom):
            for alias in node.names:
                # alias.asname is the 'as' name, alias.name is the original name
                # If aliased, check asname; otherwise check the original name
                imported_as = alias.asname if alias.asname else alias.name
                if imported_as == "app":
                    return True

        # Check for top-level class named 'handler'
        # e.g., class handler(BaseHTTPRequestHandler):
        if isinstance(node, ast.ClassDef) and node.name.lower() == "handler":
            return True

    return False


class _Writer:
    def __init__(self, handler: "_ResponseCapture") -> None:
        self._handler = handler

    def write(self, data: bytes) -> None:
        self._handler._body_chunks.append(data)


class _ResponseCapture:

    def __init__(self) -> None:
        self._status = 200
        self._headers: list[tuple[bytes, bytes]] = []
        self._body_chunks: list[bytes] = []

        self.command = "GET"
        self.path = "/"
        self.headers: dict[str, str] = {}
        self.rfile = io.BytesIO()
        self.wfile = _Writer(self)

    def send_response(self, code: int, message: str | None = None) -> None:
        self._status = code

    def send_header(self, key: str, value: Any) -> None:
        self._headers.append(
            (key.lower().encode("latin-1"), str(value).encode("latin-1"))
        )

    def end_headers(self) -> None:
        pass


def handler_to_asgi(HandlerCls: type[BaseHTTPRequestHandler]) -> Callable[[Scope, Receive, Send], Coroutine[Any, Any, Any]]:
    """
    Wrap a simple BaseHTTPRequestHandler subclass as an ASGI app.

    Supports:
      - send_response
      - send_header
      - end_headers
      - wfile.write
      - reading body from rfile
    """

    async def app(scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            raise RuntimeError("This adapter only supports HTTP")

        # Read full request body (if any)
        body = b""
        while True:
            event = await receive()
            if event["type"] != "http.request":
                continue
            body += event.get("body", b"")
            if not event.get("more_body", False):
                break

        h = _ResponseCapture()
        h.command = scope["method"]
        qs = scope.get("query_string", b"")
        if qs:
            h.path = scope["path"] + "?" + qs.decode("latin-1")
        else:
            h.path = scope["path"]

        h.rfile = io.BytesIO(body)
        h.headers = {
            name.decode("latin-1"): value.decode("latin-1")
            for name, value in scope.get("headers", [])
        }

        # Call the do_* method from HandlerCls with our capture handler as self
        method_name = f"do_{h.command}"
        if hasattr(HandlerCls, method_name):
            method = getattr(HandlerCls, method_name)
            try:
                method(h)
            except Exception:
                h = _ResponseCapture()
                h.send_response(500)
                h.send_header("content-type", "text/plain")
                h.end_headers()
                h.wfile.write(b"Internal Server Error")
        else:
            h.send_response(405)
            h.send_header("content-type", "text/plain")
            h.end_headers()
            h.wfile.write(b"Method Not Allowed")

        # Send ASGI response
        await send(
            {
                "type": "http.response.start",
                "status": h._status,
                "headers": h._headers,
            }
        )
        await send(
            {
                "type": "http.response.body",
                "body": b"".join(h._body_chunks),
            }
        )

    return app


def is_sanic_app(app: Any) -> bool:
    try:
        from sanic import Sanic
        return isinstance(app, Sanic)
    except ImportError:
        return False


def sanic_to_asgi(sanic_app: Any) -> Callable[[Scope, Receive, Send], Coroutine[Any, Any, Any]]:
    """Wrap a Sanic app for use as a sub-mounted ASGI app.

    Sanic requires special initialization when embedded under another ASGI app:
    - asgi=True to allow event loop access
    - finalize() to compile routes
    - signal_router.finalize() on first request (needs running event loop)
    - allow_fail_builtin=False to ignore missing lifecycle signals
    """
    sanic_app.asgi = True
    sanic_app.finalize()
    sanic_app.signal_router.allow_fail_builtin = False

    async def asgi(scope: Scope, receive: Receive, send: Send) -> None:
        if not sanic_app.signal_router.finalized:
            sanic_app.signal_router.finalize()
        await sanic_app(scope, receive, send)

    return asgi


def create_route_handler(entrypoint_module) -> Callable[[Scope, Receive, Send], Coroutine[Any, Any, Any]]:
    handler = getattr(entrypoint_module, "handler", None) or getattr(entrypoint_module, "Handler", None)
    if handler is not None:
        return handler_to_asgi(handler)
    elif getattr(entrypoint_module, "app", None):
        app = entrypoint_module.app
        if is_sanic_app(app):
            return sanic_to_asgi(app)
        is_wsgi = (
            not inspect.iscoroutinefunction(app) and
            not inspect.iscoroutinefunction(app.__call__)
        )
        if is_wsgi:
            return WsgiToAsgi(app)
        return app
    else:
        raise ValueError(f"No handler or app found in {entrypoint_module}")


def path_to_route_path(api_dir: Path, path: Path) -> tuple[str, str]:
    """Convert a file path relative to the api directory to a Starlette route path.

    Returns:
        Tuple of (route_path, py_extension_path):
        - route_path: The clean route (e.g., /api/users/{id})
        - py_extension_path: The route with .py extension for legacy requests
          (e.g., /api/users.py or /api/users/index.py for index files)

    Examples:
        api/users/[id]/index.py -> (/api/users/{id}, /api/users/{id}/index.py)
        api/users/[id].py -> (/api/users/{id}, /api/users/{id}.py)
        api/python.py -> (/api/python, /api/python.py)
        api/index.py -> (/api, /api/index.py)
    """
    route = path.relative_to(api_dir).with_suffix('').as_posix()

    is_index = route == 'index' or route.endswith('/index')

    if route == 'index':
        route = ''
    elif route.endswith('/index'):
        route = route[:-6]

    # Convert catch-all [...param] to {param:path}
    route = re.sub(r'\[\.\.\.([^\]]+)\]', r'{\1:path}', route)
    # Convert dynamic [param] to {param}
    route = re.sub(r'\[([^\]]+)\]', r'{\1}', route)

    if not route.startswith('/'):
        route = '/' + route

    clean_route = f"/api{route}"

    # Build the .py extension path
    if is_index:
        # For index files: /api -> /api/index.py, /api/users -> /api/users/index.py
        py_route = f"{clean_route}/index.py".replace('//', '/')
    else:
        # For regular files: /api/python -> /api/python.py
        py_route = f"{clean_route}.py"

    return clean_route, py_route


def import_module_from_path(path: Path) -> ModuleType:
    """Import a module from a file path without requiring it to be in sys.path."""
    spec = importlib.util.spec_from_file_location(path.stem, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load module from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_api_dir_entrypoints(api_dir: Path) -> list[tuple[str, str, ModuleType]]:
    """Load entrypoint modules from an API directory.

    Only imports files that export an entrypoint (checked via AST first).

    Returns:
        List of (route_path, py_extension_path, module) tuples.
    """
    entrypoints: list[tuple[str, str, ModuleType]] = []

    for path in api_dir.glob("**/*.py"):
        if path.is_file() and path.name != "__init__.py" and file_contains_app_or_handler(path):
            module = import_module_from_path(path)
            route_path, py_route_path = path_to_route_path(api_dir, path)
            entrypoints.append((route_path, py_route_path, module))

    return entrypoints


def create_meta_app(api_dir: Path) -> Starlette:
    """Create a consolidated Starlette app that routes to all Python API handlers."""
    entrypoints = load_api_dir_entrypoints(api_dir)

    # Sort entrypoints by specificity: static routes first, then by segment count
    # This ensures /api/users matches before /api/users/{id}
    def route_priority(item: tuple[str, str, ModuleType]) -> tuple[int, int, str]:
        path = item[0]
        dynamic_count = path.count('{')
        segment_count = path.count('/')
        # Static routes first, then fewer dynamic segments, then more specific paths
        return (dynamic_count, -segment_count, path)

    entrypoints.sort(key=route_priority)

    routes: list[BaseRoute] = []
    for path, py_path, module in entrypoints:
        handler = create_route_handler(module)
        routes.append(ASGIRoute(path, handler, name=path.replace('/', '_').strip('_')))

        # Also register variants for compatibility:
        # 1. With .py extension (e.g., /api/python.py) - matches legacy requests
        # 2. Trailing slash variants
        if ':path}' not in path:
            # Add .py extension variant (e.g., /api/python.py or /api/index.py)
            routes.append(ASGIRoute(py_path, handler))

            if path.endswith('/'):
                routes.append(ASGIRoute(path.rstrip('/'), handler))
            else:
                routes.append(ASGIRoute(path + '/', handler))

    return Starlette(routes=routes)


def main() -> None:
    import uvicorn
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("api_dir", type=Path)
    parser.add_argument("--host", type=str, default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    _app = create_meta_app(args.api_dir)
    uvicorn.run(_app, host=args.host, port=args.port)


# When used as an entrypoint by @vercel/python in consolidated API mode,
# automatically create the app by discovering handlers in the api/ directory.
# The api/ directory is expected to be at the same level as this file.
_api_dir = Path(__file__).parent / "api"
if _api_dir.exists():
    app = create_meta_app(_api_dir)


if __name__ == "__main__":
    main()
