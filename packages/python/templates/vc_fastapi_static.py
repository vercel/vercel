"""
Discover concrete files owned by FastAPI ``app.frontend()`` routes.

The collector asks FastAPI's own router which frontend wins for each concrete
URL. Files shadowed by a normal API/Starlette route are deliberately omitted,
as are ordinary ``StaticFiles`` mounts. This lets Vercel put only safe
frontend responses on the CDN while FastAPI retains its normal precedence,
fallback, redirect, and 404 behavior.

Usage: python <this_script> <module_name> <variable_name> <output_path>
"""

from __future__ import annotations

import importlib
import json
import os
import stat
import sys
from dataclasses import asdict, dataclass
from typing import Any

from starlette.routing import Match


@dataclass
class FrontendMount:
    urlPath: str
    directory: str


@dataclass
class FrontendFile:
    # URL that Vercel should expose for this file.
    urlPath: str
    # Absolute source path copied into Build Output API static files.
    sourcePath: str
    # Request paths that FastAPI resolves to this concrete file. This includes
    # directory-index aliases such as "/" for "/index.html".
    requestPaths: list[str]


@dataclass
class FrontendDiscovery:
    mounts: list[FrontendMount]
    files: list[FrontendFile]
    runtimeFiles: list[str]


@dataclass
class _FrontendRecord:
    url_path: str
    directory: str
    group: Any
    route: Any
    prefix: str


def _join_frontend_paths(prefix: str, path: str) -> str:
    if not prefix:
        return path
    if path == "/":
        return prefix
    return prefix + path


def _join_url_path(prefix: str, relative_path: str) -> str:
    relative_path = relative_path.replace(os.sep, "/").lstrip("/")
    if prefix == "/":
        return "/" + relative_path
    return prefix.rstrip("/") + "/" + relative_path


def _make_scope(path: str) -> dict[str, Any]:
    return {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "https",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "root_path": "",
        "headers": [],
        "client": ("127.0.0.1", 0),
        "server": ("vercel", 443),
    }


def _route_has_ambiguous_matching(route: Any) -> bool:
    """Return true when route matching depends on more than path/method."""
    route_type = type(route)
    route_name = route_type.__name__
    route_module = route_type.__module__

    # Host routes and user-defined BaseRoute implementations can inspect the
    # host, headers, or arbitrary request state. A build-time path probe cannot
    # prove that a frontend file will not collide with them.
    if route_name == "Host" and route_module == "starlette.routing":
        return True
    if route_name == "_IncludedRouter" and route_module == "fastapi.routing":
        original_router = getattr(route, "original_router", None)
        return any(
            _route_has_ambiguous_matching(child)
            for child in getattr(original_router, "routes", [])
        )

    known_route_names = {
        "APIRoute",
        "APIWebSocketRoute",
        "Mount",
        "Route",
        "WebSocketRoute",
    }
    return not (
        route_name in known_route_names
        and route_module in {"fastapi.routing", "starlette.routing"}
    )


def _normal_route_matches(router: Any, path: str) -> bool:
    if any(_route_has_ambiguous_matching(route) for route in router.routes):
        return True

    scope = _make_scope(path)
    for route in router.routes:
        match, _ = route.matches(scope)
        if match != Match.NONE:
            return True

    if not router.redirect_slashes or path == "/":
        return False

    redirect_path = path.rstrip("/") if path.endswith("/") else path + "/"
    redirect_scope = _make_scope(redirect_path)
    return any(
        route.matches(redirect_scope)[0] != Match.NONE for route in router.routes
    )


def _iter_frontend_records(router: Any) -> list[_FrontendRecord]:
    records: list[_FrontendRecord] = []
    iter_low_priority = getattr(router, "_iter_low_priority_routes", None)
    if not callable(iter_low_priority):
        return records

    for candidate in iter_low_priority():
        group = getattr(candidate, "original_route", candidate)
        routes = getattr(group, "routes", None)
        if not isinstance(routes, list):
            continue

        prefix = getattr(candidate, "frontend_prefix", "")
        for route in routes:
            static_app = getattr(route, "app", None)
            directory = getattr(static_app, "directory", None)
            route_path = getattr(route, "path", None)
            if directory is None or not isinstance(route_path, str):
                continue
            # This intentionally recognizes FastAPI's frontend route shape
            # instead of every Starlette StaticFiles mount.
            if not hasattr(route, "matches_with_path"):
                continue
            records.append(
                _FrontendRecord(
                    url_path=_join_frontend_paths(prefix, route_path),
                    directory=os.path.realpath(os.fspath(directory)),
                    group=group,
                    route=route,
                    prefix=prefix,
                )
            )
    return records


def _selected_frontend_record(
    router: Any,
    records: list[_FrontendRecord],
    path: str,
) -> _FrontendRecord | None:
    if _normal_route_matches(router, path):
        return None

    scope = _make_scope(path)
    match_low_priority = getattr(router, "_match_low_priority", None)
    if not callable(match_low_priority):
        return None

    match, _, low_priority_route, effective_context = match_low_priority(scope)
    if match != Match.FULL or low_priority_route is None:
        return None

    group = getattr(effective_context, "original_route", low_priority_route)
    prefix = getattr(effective_context, "frontend_prefix", "")
    match_group = getattr(group, "_match", None)
    if not callable(match_group):
        return None

    group_match, _, selected_route = match_group(scope, prefix=prefix)
    if group_match != Match.FULL or selected_route is None:
        return None

    selected_directory = getattr(
        getattr(selected_route, "app", None), "directory", None
    )
    if selected_directory is None:
        return None
    selected_directory = os.path.realpath(os.fspath(selected_directory))
    selected_path = _join_frontend_paths(prefix, selected_route.path)

    return next(
        (
            record
            for record in records
            if record.group is group
            and record.route is selected_route
            and record.url_path == selected_path
            and record.directory == selected_directory
        ),
        None,
    )


def _lookup_concrete_file(record: _FrontendRecord, request_path: str) -> str | None:
    if record.url_path == "/":
        relative_path = request_path.lstrip("/")
    elif request_path == record.url_path:
        relative_path = ""
    else:
        prefix = record.url_path.rstrip("/") + "/"
        if not request_path.startswith(prefix):
            return None
        relative_path = request_path[len(prefix) :]

    static_app = record.route.app
    full_path, stat_result = static_app.lookup_path(relative_path)
    if stat_result is not None and stat.S_ISREG(stat_result.st_mode):
        return os.path.realpath(full_path)
    if stat_result is not None and stat.S_ISDIR(stat_result.st_mode):
        full_path, stat_result = static_app.lookup_path(
            os.path.join(relative_path, "index.html")
        )
        if stat_result is not None and stat.S_ISREG(stat_result.st_mode):
            return os.path.realpath(full_path)
    return None


def _collect_files(router: Any, records: list[_FrontendRecord]) -> list[FrontendFile]:
    # Start with the public URL of every concrete file. FastAPI is then the
    # source of truth for which frontend (if any) owns that URL.
    candidates: set[str] = set()
    for record in records:
        for root, _, names in os.walk(record.directory):
            for name in names:
                source = os.path.join(root, name)
                if not os.path.isfile(source):
                    continue
                relative_path = os.path.relpath(source, record.directory)
                candidates.add(_join_url_path(record.url_path, relative_path))

    files: list[FrontendFile] = []
    for url_path in sorted(candidates):
        selected = _selected_frontend_record(router, records, url_path)
        if selected is None:
            continue
        source_path = _lookup_concrete_file(selected, url_path)
        if source_path is None:
            continue

        request_paths = [url_path]
        if url_path.endswith("/index.html"):
            directory_path = url_path[: -len("index.html")]
            selected_directory = _selected_frontend_record(
                router, records, directory_path
            )
            if (
                selected_directory is not None
                and _lookup_concrete_file(selected_directory, directory_path)
                == source_path
            ):
                request_paths.append(directory_path)

        files.append(
            FrontendFile(
                urlPath=url_path,
                sourcePath=source_path,
                requestPaths=request_paths,
            )
        )
    return files


def _lookup_fallback_file(record: _FrontendRecord, name: str) -> str | None:
    full_path, stat_result = record.route.app.lookup_path(name)
    if stat_result is None or not stat.S_ISREG(stat_result.st_mode):
        return None
    return os.path.realpath(full_path)


def _collect_runtime_files(records: list[_FrontendRecord]) -> list[str]:
    """Collect files FastAPI still needs for non-concrete fallback responses."""
    runtime_files: set[str] = set()
    for record in records:
        static_app = record.route.app
        fallback = getattr(static_app, "fallback", None)
        fallback_file: str | None = None
        if fallback == "404.html":
            fallback_file = _lookup_fallback_file(record, "404.html")
        elif fallback == "index.html":
            fallback_file = _lookup_fallback_file(record, "index.html")
        elif fallback == "auto":
            fallback_file = _lookup_fallback_file(record, "404.html")
            if fallback_file is None:
                fallback_file = _lookup_fallback_file(record, "index.html")
        if fallback_file is not None:
            runtime_files.add(fallback_file)
    return sorted(runtime_files)


def write_output(output_path: str, data: FrontendDiscovery) -> None:
    with open(output_path, "w") as f:
        json.dump(asdict(data), f)


def main() -> None:
    module_name = sys.argv[1]
    variable_name = sys.argv[2]
    output_path = sys.argv[3]
    sys.path.insert(0, os.getcwd())
    mod = importlib.import_module(module_name)

    app = getattr(mod, variable_name, None)
    if app is None:
        raise RuntimeError(
            f'FastAPI entrypoint object "{module_name}:{variable_name}" does not exist'
        )
    router = getattr(app, "router", None)
    if router is None:
        raise RuntimeError(
            f'FastAPI entrypoint object "{module_name}:{variable_name}" has no router'
        )

    records = _iter_frontend_records(router)
    mounts = [
        FrontendMount(urlPath=record.url_path, directory=record.directory)
        for record in records
    ]
    write_output(
        output_path,
        FrontendDiscovery(
            mounts=mounts,
            files=_collect_files(router, records),
            runtimeFiles=_collect_runtime_files(records),
        ),
    )


main()
