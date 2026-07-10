"""
Discover FastAPI ``frontend()`` registrations by recording calls to FastAPI's
public router APIs while importing the user's application.

For every frontend directory, identify files whose URLs are owned by normal
FastAPI/Starlette routes. Those files remain in the Lambda bundle but are
excluded from the CDN output, preserving FastAPI's low-priority routing.

Usage:
    python <script> <entrypoint_abs> <variable_name> <output_path> <module_name>
"""

from __future__ import annotations

import importlib
import json
import os
import posixpath
import sys
from dataclasses import dataclass, field
from typing import Any


@dataclass
class FrontendCall:
    path: str
    directory: str


@dataclass
class RouterInclude:
    router: object
    prefix: str


@dataclass
class EffectiveFrontend:
    url_path: str
    directory: str
    excluded_paths: set[str] = field(default_factory=set)


def write_output(output_path: str, data: list[object]) -> None:
    with open(output_path, "w") as file:
        json.dump(data, file)


def join_url_paths(*paths: str) -> str:
    parts = [part.strip("/") for part in paths if part and part != "/"]
    return f"/{'/'.join(parts)}" if parts else "/"


def record_frontend_calls(
    module_name: str, variable_name: str
) -> tuple[object, list[EffectiveFrontend]]:
    from fastapi import APIRouter

    original_frontend = getattr(APIRouter, "frontend", None)
    if original_frontend is None:
        return object(), []

    original_include_router = APIRouter.include_router
    frontend_calls: dict[int, list[FrontendCall]] = {}
    router_includes: dict[int, list[RouterInclude]] = {}

    def recording_frontend(
        router: object,
        path: str,
        *,
        directory: str | os.PathLike[str],
        **kwargs: Any,
    ) -> None:
        original_frontend(router, path, directory=directory, **kwargs)
        frontend_calls.setdefault(id(router), []).append(
            FrontendCall(
                path=path,
                directory=os.path.realpath(os.fspath(directory)),
            )
        )

    def recording_include_router(
        parent: object, child: object, *args: Any, **kwargs: Any
    ) -> None:
        original_include_router(parent, child, *args, **kwargs)
        router_includes.setdefault(id(parent), []).append(
            RouterInclude(router=child, prefix=str(kwargs.get("prefix", "")))
        )

    APIRouter.frontend = recording_frontend  # type: ignore[method-assign]
    APIRouter.include_router = recording_include_router  # type: ignore[method-assign]
    try:
        module = importlib.import_module(module_name)
    finally:
        APIRouter.frontend = original_frontend  # type: ignore[method-assign]
        APIRouter.include_router = original_include_router  # type: ignore[method-assign]

    app = getattr(module, variable_name, None)
    if app is None:
        raise RuntimeError(
            f"FastAPI entrypoint module '{module_name}' has no '{variable_name}' variable"
        )

    root_router = getattr(app, "router", None)
    if root_router is None:
        return app, []

    effective_frontends: list[EffectiveFrontend] = []

    def visit_router(
        router: object, inherited_prefix: str, ancestors: frozenset[int]
    ) -> None:
        router_id = id(router)
        if router_id in ancestors:
            return
        next_ancestors = ancestors | {router_id}
        router_prefix = str(getattr(router, "prefix", ""))

        # FastAPI checks a router's own frontend group before frontend groups
        # from routers included into it.
        for call in frontend_calls.get(router_id, []):
            effective_frontends.append(
                EffectiveFrontend(
                    url_path=join_url_paths(inherited_prefix, router_prefix, call.path),
                    directory=call.directory,
                )
            )

        for included in router_includes.get(router_id, []):
            visit_router(
                included.router,
                join_url_paths(inherited_prefix, router_prefix, included.prefix),
                next_ancestors,
            )

    visit_router(root_router, "", frozenset())
    return app, effective_frontends


def frontend_matches(frontend_path: str, request_path: str) -> bool:
    if frontend_path == "/":
        return True
    return request_path == frontend_path or request_path.startswith(frontend_path + "/")


def select_frontend(
    frontends: list[EffectiveFrontend], request_path: str
) -> EffectiveFrontend | None:
    selected: EffectiveFrontend | None = None
    selected_specificity = -1
    for frontend in frontends:
        if not frontend_matches(frontend.url_path, request_path):
            continue
        specificity = 0 if frontend.url_path == "/" else len(frontend.url_path)
        if specificity > selected_specificity:
            selected = frontend
            selected_specificity = specificity
    return selected


def make_http_scope(path: str) -> dict[str, Any]:
    return {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "https",
        "path": path,
        "raw_path": path.encode("utf-8"),
        "root_path": "",
        "query_string": b"",
        "headers": [(b"host", b"localhost")],
        "client": ("127.0.0.1", 0),
        "server": ("localhost", 443),
    }


def make_websocket_scope(path: str) -> dict[str, Any]:
    return {
        "type": "websocket",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "scheme": "wss",
        "path": path,
        "raw_path": path.encode("utf-8"),
        "root_path": "",
        "query_string": b"",
        "headers": [(b"host", b"localhost")],
        "client": ("127.0.0.1", 0),
        "server": ("localhost", 443),
        "subprotocols": [],
    }


def get_normal_route_contexts(app: object) -> tuple[list[object], bool]:
    try:
        from fastapi.routing import iter_route_contexts
        from starlette.routing import Host
    except ImportError:
        # A FastAPI version with frontend() should also expose route contexts.
        # If it does not, fail closed and keep every file in the Lambda.
        return [], True

    contexts = list(iter_route_contexts(getattr(app, "routes", [])))
    has_host_route = any(
        isinstance(getattr(context, "original_route", None), Host)
        for context in contexts
    )
    return contexts, has_host_route


def normal_route_claims_path(
    route_contexts: list[object],
    path: str,
    *,
    redirect_slashes: bool,
    fail_closed: bool,
) -> bool:
    if fail_closed:
        return True

    from starlette.routing import Match

    candidate_paths = [path]
    if redirect_slashes and path != "/":
        candidate_paths.append(path.rstrip("/") if path.endswith("/") else path + "/")

    for candidate_path in candidate_paths:
        for scope in (
            make_http_scope(candidate_path),
            make_websocket_scope(candidate_path),
        ):
            for context in route_contexts:
                try:
                    match, _ = context.matches(scope)  # type: ignore[attr-defined]
                except Exception:
                    return True
                if match != Match.NONE:
                    # PARTIAL is significant: FastAPI returns 405 for a normal
                    # route with the wrong method before considering frontends.
                    return True
    return False


def file_url_aliases(frontend_path: str, relative_path: str) -> set[str]:
    aliases = {join_url_paths(frontend_path, relative_path)}
    if posixpath.basename(relative_path) == "index.html":
        parent = posixpath.dirname(relative_path)
        directory_url = join_url_paths(frontend_path, parent)
        aliases.add(directory_url)
        if directory_url != "/":
            aliases.add(directory_url + "/")
    return aliases


def mark_excluded_paths(app: object, frontends: list[EffectiveFrontend]) -> None:
    route_contexts, has_host_route = get_normal_route_contexts(app)
    router = getattr(app, "router", None)
    redirect_slashes = bool(getattr(router, "redirect_slashes", False))

    for frontend in frontends:
        if not os.path.isdir(frontend.directory):
            continue

        for root, directory_names, file_names in os.walk(frontend.directory):
            directory_names.sort()
            file_names.sort()

            # Preserve FastAPI's symlink safety rather than copying links into
            # public output with potentially different platform semantics.
            for directory_name in list(directory_names):
                full_path = os.path.join(root, directory_name)
                if os.path.islink(full_path):
                    relative_path = os.path.relpath(
                        full_path, frontend.directory
                    ).replace(os.sep, "/")
                    frontend.excluded_paths.add(relative_path)
                    directory_names.remove(directory_name)

            for file_name in file_names:
                full_path = os.path.join(root, file_name)
                relative_path = os.path.relpath(full_path, frontend.directory).replace(
                    os.sep, "/"
                )

                if os.path.islink(full_path):
                    frontend.excluded_paths.add(relative_path)
                    continue

                aliases = file_url_aliases(frontend.url_path, relative_path)
                if any(
                    select_frontend(frontends, alias) is not frontend
                    or normal_route_claims_path(
                        route_contexts,
                        alias,
                        redirect_slashes=redirect_slashes,
                        fail_closed=has_host_route,
                    )
                    for alias in aliases
                ):
                    frontend.excluded_paths.add(relative_path)


def main() -> None:
    entrypoint_abs = sys.argv[1]
    variable_name = sys.argv[2]
    output_path = sys.argv[3]
    module_name = sys.argv[4]

    # Match the runtime import environment: project modules are imported from
    # the work path, not from the directory containing this shim.
    sys.path.insert(0, os.getcwd())

    try:
        app, frontends = record_frontend_calls(module_name, variable_name)
        mark_excluded_paths(app, frontends)
    except Exception as exc:
        print(
            f"vc_fastapi_static: failed to inspect {entrypoint_abs}: {exc}",
            file=sys.stderr,
        )
        raise

    data = [
        {
            "urlPath": frontend.url_path,
            "directory": frontend.directory,
            "excludedPaths": sorted(frontend.excluded_paths),
        }
        for frontend in frontends
        if os.path.isdir(frontend.directory)
    ]
    write_output(output_path, data)


main()
