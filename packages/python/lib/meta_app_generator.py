"""
Meta-app generator for combining multiple Python API handlers into a single Starlette app.

This script generates a Python file that:
1. Imports all Python handlers from the api/ directory
2. Wraps WSGI apps, ASGI apps, and HTTP handlers appropriately
3. Mounts them at the correct filesystem-based routes using Starlette's path routing
4. Exports a single `app` that can be used by vc_init.py

The generated app uses Starlette's Route-based routing (not Mount) to properly
handle path parameters and catch-all routes.
"""

import os
import re
import sys
import json
import ast
from pathlib import Path
from typing import Literal


def path_to_route_pattern(file_path: str, base_dir: str = "api") -> str:
    """Convert a file path to a Starlette route pattern.

    Examples:
        api/index.py -> /api
        api/users.py -> /api/users
        api/users/index.py -> /api/users
        api/users/[id].py -> /api/users/{id}
        api/users/[id]/posts.py -> /api/users/{id}/posts
        api/posts/[...slug].py -> /api/posts/{slug:path}
    """
    # Remove base_dir prefix and .py extension
    rel_path = file_path
    if rel_path.startswith(base_dir + "/"):
        rel_path = rel_path[len(base_dir) + 1:]
    rel_path = rel_path.replace(".py", "")

    # Handle index files
    if rel_path == "index":
        rel_path = ""
    elif rel_path.endswith("/index"):
        rel_path = rel_path[:-6]

    # Convert catch-all [...param] to {param:path}
    rel_path = re.sub(r'\[\.\.\.(\w+)\]', r'{\1:path}', rel_path)
    # Convert dynamic [param] to {param}
    rel_path = re.sub(r'\[(\w+)\]', r'{\1}', rel_path)

    route = f"/{base_dir}/{rel_path}" if rel_path else f"/{base_dir}"
    return route.rstrip("/") or "/"


def detect_handler_type(file_path: str) -> Literal["asgi", "wsgi", "http_handler", "unknown"]:
    """Detect the type of handler in a Python file using AST parsing."""
    try:
        with open(file_path, "r") as f:
            code = f.read()
        tree = ast.parse(code)
    except (SyntaxError, FileNotFoundError):
        return "unknown"

    has_app = False
    has_handler = False
    is_async_app = False

    # Known async frameworks
    async_frameworks = {"FastAPI", "Starlette", "Quart", "Sanic", "Litestar"}
    async_modules = {"fastapi", "starlette", "quart", "sanic", "litestar"}

    for node in ast.iter_child_nodes(tree):
        # Check for 'app' variable assignment
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "app":
                    has_app = True
                    # Try to detect if it's an async framework
                    if isinstance(node.value, ast.Call):
                        if isinstance(node.value.func, ast.Name):
                            if node.value.func.id in async_frameworks:
                                is_async_app = True
                        elif isinstance(node.value.func, ast.Attribute):
                            if node.value.func.attr in async_frameworks:
                                is_async_app = True

        # Check for annotated assignment
        if isinstance(node, ast.AnnAssign):
            if isinstance(node.target, ast.Name) and node.target.id == "app":
                has_app = True

        # Check for function named 'app' (WSGI/ASGI callable)
        if isinstance(node, ast.FunctionDef) and node.name == "app":
            has_app = True
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "app":
            has_app = True
            is_async_app = True

        # Check for import of 'app'
        if isinstance(node, ast.ImportFrom):
            for alias in node.names:
                imported_as = alias.asname if alias.asname else alias.name
                if imported_as == "app":
                    has_app = True
                    if node.module and any(fw in node.module for fw in async_modules):
                        is_async_app = True

        # Check for 'handler' or 'Handler' class
        if isinstance(node, ast.ClassDef) and node.name.lower() == "handler":
            has_handler = True

    if has_handler:
        return "http_handler"
    elif has_app:
        return "asgi" if is_async_app else "wsgi"
    return "unknown"


def generate_module_name(file_path: str) -> str:
    """Generate a valid Python module name from a file path."""
    name = file_path.replace(".py", "")
    name = re.sub(r'[/\\\[\].\-]', '_', name)
    name = re.sub(r'_+', '_', name)
    name = name.strip('_')
    return f"__vc_mod_{name}"


def extract_path_params(route: str) -> list[str]:
    """Extract path parameter names from a Starlette route pattern."""
    # Match {param} or {param:path}
    return re.findall(r'\{(\w+)(?::\w+)?\}', route)


def generate_meta_app_code(api_files: list[dict]) -> str:
    """Generate the Python code for the meta-app.

    Args:
        api_files: List of dicts with 'path', 'type', and 'route' keys
    """
    imports = """\
from starlette.applications import Starlette
from starlette.routing import Route, Mount
from starlette.requests import Request
from starlette.responses import Response, PlainTextResponse, StreamingResponse
from starlette.middleware.wsgi import WSGIMiddleware
import importlib.util
import inspect
import sys
import os
import asyncio
from http.server import BaseHTTPRequestHandler
from io import BytesIO
from urllib.parse import parse_qs
"""

    # HTTP Handler adapter - converts BaseHTTPRequestHandler to ASGI
    http_handler_adapter = '''\

class HTTPHandlerToASGI:
    """Adapter to convert BaseHTTPRequestHandler to ASGI."""

    def __init__(self, handler_class):
        self.handler_class = handler_class

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return

        # Collect request body
        body_parts = []
        while True:
            message = await receive()
            body_parts.append(message.get("body", b""))
            if not message.get("more_body", False):
                break
        body = b"".join(body_parts)

        # Build headers dict
        headers = {}
        for key, value in scope.get("headers", []):
            k = key.decode() if isinstance(key, bytes) else key
            v = value.decode() if isinstance(value, bytes) else value
            headers[k] = v

        # Build path with query string
        path = scope.get("path", "/")
        query_string = scope.get("query_string", b"")
        if query_string:
            path += "?" + query_string.decode()

        # Create response collector
        response_status = [200]
        response_headers = []
        response_body = BytesIO()

        class RequestHandler(self.handler_class):
            def __init__(self_handler):
                self_handler.rfile = BytesIO(body)
                self_handler.wfile = response_body
                self_handler.requestline = f"{scope['method']} {path} HTTP/1.1"
                self_handler.command = scope["method"]
                self_handler.path = path
                self_handler.headers = headers
                self_handler.request_version = "HTTP/1.1"
                self_handler.close_connection = True

            def send_response(self_handler, code, message=None):
                response_status[0] = code

            def send_header(self_handler, keyword, value):
                response_headers.append((keyword.encode(), str(value).encode()))

            def end_headers(self_handler):
                pass

            def log_message(self_handler, format, *args):
                pass  # Suppress default logging

        handler = RequestHandler()
        method_name = f"do_{scope['method']}"
        if hasattr(handler, method_name):
            method = getattr(handler, method_name)
            if asyncio.iscoroutinefunction(method):
                await method()
            else:
                await asyncio.to_thread(method)

        await send({
            "type": "http.response.start",
            "status": response_status[0],
            "headers": response_headers,
        })
        await send({
            "type": "http.response.body",
            "body": response_body.getvalue(),
        })
'''

    # WSGI adapter that injects path parameters
    wsgi_adapter = '''\

class WSGIWithPathParams:
    """WSGI middleware that injects Starlette path params into environ."""

    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    async def __call__(self, scope, receive, send):
        # Inject path params into query string for WSGI apps
        path_params = scope.get("path_params", {})

        # Create modified scope with path params in query string
        new_scope = dict(scope)
        query_string = scope.get("query_string", b"").decode()
        for key, value in path_params.items():
            sep = "&" if query_string else ""
            query_string += f"{sep}{key}={value}"
        new_scope["query_string"] = query_string.encode()

        # Use Starlette's WSGIMiddleware
        wsgi_middleware = WSGIMiddleware(self.wsgi_app)
        await wsgi_middleware(new_scope, receive, send)
'''

    # Route handler wrapper
    route_wrapper = '''\

def create_route_handler(app_module, handler_type: str):
    """Create an ASGI handler for a route based on handler type."""

    if handler_type == "asgi":
        async def asgi_handler(request: Request):
            # Get the ASGI app and call it directly
            asgi_app = app_module.app
            scope = dict(request.scope)
            scope["path_params"] = request.path_params

            # For sub-applications, we may need to adjust the path
            response_started = False
            response_status = 200
            response_headers = []
            response_body = []

            async def receive():
                body = await request.body()
                return {"type": "http.request", "body": body, "more_body": False}

            async def send(message):
                nonlocal response_started, response_status, response_headers, response_body
                if message["type"] == "http.response.start":
                    response_started = True
                    response_status = message["status"]
                    response_headers = message.get("headers", [])
                elif message["type"] == "http.response.body":
                    body = message.get("body", b"")
                    if body:
                        response_body.append(body)

            await asgi_app(scope, receive, send)

            headers_dict = {}
            for k, v in response_headers:
                key = k.decode() if isinstance(k, bytes) else k
                val = v.decode() if isinstance(v, bytes) else v
                headers_dict[key] = val

            return Response(
                content=b"".join(response_body),
                status_code=response_status,
                headers=headers_dict,
            )

        return asgi_handler

    elif handler_type == "wsgi":
        async def wsgi_handler(request: Request):
            wsgi_app = app_module.app

            # Build WSGI environ
            body = await request.body()
            environ = {
                "REQUEST_METHOD": request.method,
                "SCRIPT_NAME": "",
                "PATH_INFO": request.url.path,
                "QUERY_STRING": request.url.query or "",
                "SERVER_NAME": request.url.hostname or "localhost",
                "SERVER_PORT": str(request.url.port or 80),
                "SERVER_PROTOCOL": "HTTP/1.1",
                "wsgi.version": (1, 0),
                "wsgi.url_scheme": request.url.scheme,
                "wsgi.input": BytesIO(body),
                "wsgi.errors": sys.stderr,
                "wsgi.multithread": True,
                "wsgi.multiprocess": False,
                "wsgi.run_once": False,
                "CONTENT_TYPE": request.headers.get("content-type", ""),
                "CONTENT_LENGTH": str(len(body)),
            }

            # Add path params to environ
            for key, value in request.path_params.items():
                environ[f"wsgi.routing_args.{key}"] = value

            # Add HTTP headers
            for key, value in request.headers.items():
                key = key.upper().replace("-", "_")
                if key not in ("CONTENT_TYPE", "CONTENT_LENGTH"):
                    environ[f"HTTP_{key}"] = value

            # Capture response
            response_started = [False]
            response_status = [200]
            response_headers = [{}]

            def start_response(status, headers, exc_info=None):
                response_started[0] = True
                response_status[0] = int(status.split(" ")[0])
                response_headers[0] = dict(headers)
                return lambda s: None

            result = wsgi_app(environ, start_response)
            body_parts = []
            try:
                for chunk in result:
                    body_parts.append(chunk)
            finally:
                if hasattr(result, "close"):
                    result.close()

            return Response(
                content=b"".join(body_parts),
                status_code=response_status[0],
                headers=response_headers[0],
            )

        return wsgi_handler

    elif handler_type == "http_handler":
        handler_class = getattr(app_module, "handler", None) or getattr(app_module, "Handler")
        adapter = HTTPHandlerToASGI(handler_class)

        async def http_handler(request: Request):
            scope = dict(request.scope)
            body = await request.body()

            response_status = [200]
            response_headers = [[]]
            response_body = [b""]

            async def receive():
                return {"type": "http.request", "body": body, "more_body": False}

            async def send(message):
                if message["type"] == "http.response.start":
                    response_status[0] = message["status"]
                    response_headers[0] = message.get("headers", [])
                elif message["type"] == "http.response.body":
                    response_body[0] = message.get("body", b"")

            await adapter(scope, receive, send)

            headers_dict = {}
            for k, v in response_headers[0]:
                key = k.decode() if isinstance(k, bytes) else k
                val = v.decode() if isinstance(v, bytes) else v
                headers_dict[key] = val

            return Response(
                content=response_body[0],
                status_code=response_status[0],
                headers=headers_dict,
            )

        return http_handler

    else:
        async def not_found(request: Request):
            return PlainTextResponse("Handler not found", status_code=404)
        return not_found
'''

    # Generate module loads
    module_loads = []
    for file_info in api_files:
        path = file_info["path"]
        mod_name = generate_module_name(path)
        module_loads.append(f'''\
# Load {path}
try:
    _spec_{mod_name} = importlib.util.spec_from_file_location("{mod_name}", os.path.join(_here, "{path}"))
    {mod_name} = importlib.util.module_from_spec(_spec_{mod_name})
    sys.modules["{mod_name}"] = {mod_name}
    _spec_{mod_name}.loader.exec_module({mod_name})
except Exception as e:
    print(f"Warning: Failed to load {path}: {{e}}")
    {mod_name} = None
''')

    # Generate routes - using Route instead of Mount for proper path param handling
    routes_code = []
    for file_info in api_files:
        path = file_info["path"]
        handler_type = file_info["type"]
        route = file_info["route"]
        mod_name = generate_module_name(path)

        # Use Route for proper path parameter handling
        # Add both exact match and trailing slash variant
        routes_code.append(
            f'    Route("{route}", endpoint=create_route_handler({mod_name}, "{handler_type}"), '
            f'methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]),'
        )
        # Also match with trailing slash
        if not route.endswith("/"):
            routes_code.append(
                f'    Route("{route}/", endpoint=create_route_handler({mod_name}, "{handler_type}"), '
                f'methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]),'
            )

    routes_str = "\n".join(routes_code)
    module_loads_str = "\n".join(module_loads)

    code = f'''\
"""
Auto-generated meta-app that combines all Python API handlers.
DO NOT EDIT - This file is generated at build time.
"""

{imports}

_here = os.path.dirname(os.path.abspath(__file__))

{http_handler_adapter}

{wsgi_adapter}

{route_wrapper}

# Load all handler modules
{module_loads_str}

# Create the combined Starlette app with all routes
routes = [
{routes_str}
]

app = Starlette(routes=routes)
'''

    return code


def main():
    """Main entry point for the generator.

    Expects JSON input with:
    {{
        "files": [
            {{"path": "api/index.py", "type": "asgi"}},
            {{"path": "api/users/[id].py", "type": "wsgi"}},
            ...
        ],
        "output": "path/to/output.py"
    }}

    Can be provided via:
    - Command line argument (path to JSON file)
    - stdin (JSON string)
    """
    if len(sys.argv) > 1:
        arg = sys.argv[1]
        # Check if it's a file path or JSON string
        if os.path.exists(arg):
            with open(arg) as f:
                config = json.load(f)
        else:
            # Assume it's a JSON string
            config = json.loads(arg)
    else:
        # Read from stdin
        config = json.load(sys.stdin)

    files = config.get("files", [])
    output_path = config.get("output", "meta_app.py")

    # Enrich files with route patterns and types if not provided
    for file_info in files:
        if "route" not in file_info:
            file_info["route"] = path_to_route_pattern(file_info["path"])
        if "type" not in file_info or file_info["type"] == "unknown":
            file_info["type"] = detect_handler_type(file_info["path"])

    # Sort routes: more specific first, catch-all last
    files.sort(key=lambda f: (
        # Catch-all routes go last
        1 if ":path}" in f["route"] else 0,
        # More dynamic segments = less priority
        f["route"].count("{"),
        # Fewer segments = less priority (more specific paths first)
        -f["route"].count("/"),
        # Alphabetical
        f["route"],
    ))

    # Generate the meta-app code
    code = generate_meta_app_code(files)

    # Write to output
    if output_path == "-":
        print(code)
    else:
        with open(output_path, "w") as f:
            f.write(code)
        print(f"Generated meta-app at {output_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
