"""
Discover concrete static files that FastAPI's router would serve.

For every file exposed by ``StaticFiles`` or ``app.frontend()``, ask the
application router which route owns its public URL. A file is promoted to CDN
output only when the corresponding static route wins for both GET and HEAD.

Usage: python <this_script> <entrypoint_abs_path> <variable_name> <output_path>
"""

from __future__ import annotations

import importlib.util
import json
import os
import stat
import sys
from dataclasses import asdict, dataclass
from typing import TYPE_CHECKING, Any

from starlette.routing import BaseRoute, Host, Match, Mount, Router
from starlette.staticfiles import StaticFiles

if TYPE_CHECKING:
    from fastapi.routing import _EffectiveRouteContext, _FrontendRouteGroup


@dataclass
class StaticMount:
    urlPath: str
    directory: str


@dataclass
class StaticFile:
    urlPath: str
    sourcePath: str


@dataclass
class StaticDiscovery:
    mounts: list[StaticMount]
    files: list[StaticFile]


@dataclass
class _StaticRecord:
    mount: StaticMount
    route: BaseRoute
    route_context: object | None = None
    frontend_group: object | None = None
    frontend_prefix: str = ""


@dataclass
class _DirectRouteContext:
    route: BaseRoute

    @property
    def original_route(self) -> BaseRoute:
        return self.route

    @property
    def methods(self) -> set[str] | None:
        return getattr(self.route, "methods", None)

    def matches(self, scope: dict[str, Any]) -> tuple[Match, dict[str, Any]]:
        return self.route.matches(scope)


def get_low_priority_routes(router: Router) -> list[_FrontendRouteGroup]:
    return getattr(router, "_low_priority_routes", [])


def get_effective_low_priority_routes(
    route: BaseRoute,
) -> list[_EffectiveRouteContext]:
    if fn := getattr(route, "effective_low_priority_routes", None):
        return fn()
    return []


def _join_url_path(prefix: str, relative_path: str) -> str:
    relative_path = relative_path.replace(os.sep, "/").lstrip("/")
    if prefix == "/":
        return "/" + relative_path
    return prefix.rstrip("/") + "/" + relative_path


def _join_mount_path(prefix: str, path: str) -> str:
    if not prefix:
        return path
    if path == "/":
        return prefix
    return prefix.rstrip("/") + path


def _make_scope(path: str, method: str) -> dict[str, Any]:
    return {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": method,
        "scheme": "https",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "root_path": "",
        "headers": [(b"host", b"vercel")],
        "client": ("127.0.0.1", 0),
        "server": ("vercel", 443),
    }


def _route_contexts(router: Router) -> list[object]:
    try:
        from fastapi.routing import iter_route_contexts
    except ImportError:
        return [_DirectRouteContext(route) for route in router.routes]
    return list(iter_route_contexts(router.routes))


def _effective_route(route_context: object) -> BaseRoute:
    starlette_route = getattr(route_context, "starlette_route", None)
    if isinstance(starlette_route, BaseRoute):
        return starlette_route
    return getattr(route_context, "original_route")


def _is_ambiguous_route(route: BaseRoute) -> bool:
    if isinstance(route, Host):
        return True

    route_type = type(route)
    known_routes = {
        ("fastapi.routing", "APIRoute"),
        ("fastapi.routing", "APIWebSocketRoute"),
        ("starlette.routing", "Mount"),
        ("starlette.routing", "Route"),
        ("starlette.routing", "WebSocketRoute"),
    }
    return (route_type.__module__, route_type.__name__) not in known_routes


def _collect_normal_records(
    route_contexts: list[object],
) -> tuple[list[_StaticRecord], bool]:
    records: list[_StaticRecord] = []
    ambiguous = False

    for route_context in route_contexts:
        original_route = getattr(route_context, "original_route")
        effective_route = _effective_route(route_context)
        if _is_ambiguous_route(original_route):
            ambiguous = True
        if not isinstance(original_route, Mount):
            continue
        static_app = original_route.app
        if not isinstance(static_app, StaticFiles):
            continue
        directory = static_app.directory
        if directory is None:
            continue
        records.append(
            _StaticRecord(
                mount=StaticMount(
                    urlPath=effective_route.path,
                    directory=os.path.realpath(os.fspath(directory)),
                ),
                route=effective_route,
                route_context=route_context,
            )
        )

    return records, ambiguous


def _iter_frontend_groups(router: Router) -> list[tuple[object, str]]:
    groups: list[tuple[object, str]] = [
        (group, "") for group in get_low_priority_routes(router)
    ]
    for route in router.routes:
        for context in get_effective_low_priority_routes(route):
            groups.append(
                (
                    context.original_route,
                    getattr(context, "frontend_prefix", ""),
                )
            )
    return groups


def _collect_frontend_records(router: Router) -> list[_StaticRecord]:
    records: list[_StaticRecord] = []
    for group, prefix in _iter_frontend_groups(router):
        for route in getattr(group, "routes", []):
            static_app = getattr(route, "app", None)
            if not isinstance(static_app, StaticFiles):
                continue
            directory = static_app.directory
            route_path = getattr(route, "path", None)
            if directory is None or not isinstance(route_path, str):
                continue
            records.append(
                _StaticRecord(
                    mount=StaticMount(
                        urlPath=_join_mount_path(prefix, route_path),
                        directory=os.path.realpath(os.fspath(directory)),
                    ),
                    route=route,
                    frontend_group=group,
                    frontend_prefix=prefix,
                )
            )
    return records


def _match_normal_route(
    route_contexts: list[object], scope: dict[str, Any]
) -> tuple[Match, object | None]:
    partial: object | None = None
    for route_context in route_contexts:
        try:
            match, _ = route_context.matches(scope)  # type: ignore[attr-defined]
        except Exception:
            return Match.FULL, None
        if match == Match.FULL:
            return match, route_context
        if match == Match.PARTIAL and partial is None:
            partial = route_context
    if partial is not None:
        return Match.PARTIAL, partial
    return Match.NONE, None


def _normal_redirect_matches(
    router: Router, route_contexts: list[object], scope: dict[str, Any]
) -> bool:
    path = scope["path"]
    if not router.redirect_slashes or path == "/":
        return False
    redirect_scope = dict(scope)
    redirect_scope["path"] = path.rstrip("/") if path.endswith("/") else path + "/"
    return _match_normal_route(route_contexts, redirect_scope)[0] != Match.NONE


def _find_normal_record(
    records: list[_StaticRecord], route_context: object | None
) -> _StaticRecord | None:
    if route_context is None:
        return None
    return next(
        (record for record in records if record.route_context is route_context),
        None,
    )


def _find_frontend_record(
    router: Router,
    records: list[_StaticRecord],
    scope: dict[str, Any],
) -> _StaticRecord | None:
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

    return next(
        (
            record
            for record in records
            if record.frontend_group is group
            and record.route is selected_route
            and record.frontend_prefix == prefix
        ),
        None,
    )


def _select_record(
    router: Router,
    route_contexts: list[object],
    records: list[_StaticRecord],
    path: str,
    method: str,
    *,
    ambiguous: bool,
) -> _StaticRecord | None:
    if ambiguous:
        return None

    scope = _make_scope(path, method)
    normal_match, route_context = _match_normal_route(route_contexts, scope)
    if normal_match == Match.FULL:
        return _find_normal_record(records, route_context)
    if normal_match == Match.PARTIAL:
        return None
    if _normal_redirect_matches(router, route_contexts, scope):
        return None
    return _find_frontend_record(router, records, scope)


def _lookup_file(record: _StaticRecord, request_path: str) -> str | None:
    mount_path = record.mount.urlPath
    if mount_path == "/":
        relative_path = request_path.lstrip("/")
    elif request_path == mount_path:
        relative_path = ""
    else:
        prefix = mount_path.rstrip("/") + "/"
        if not request_path.startswith(prefix):
            return None
        relative_path = request_path[len(prefix) :]

    full_path, stat_result = record.route.app.lookup_path(relative_path)  # type: ignore[union-attr]
    if stat_result is None or not stat.S_ISREG(stat_result.st_mode):
        return None
    return os.path.realpath(full_path)


def _candidate_paths(records: list[_StaticRecord]) -> set[str]:
    paths: set[str] = set()
    for record in records:
        if not os.path.isdir(record.mount.directory):
            continue
        for root, directory_names, file_names in os.walk(record.mount.directory):
            directory_names.sort()
            file_names.sort()
            for file_name in file_names:
                source_path = os.path.join(root, file_name)
                if not os.path.isfile(source_path):
                    continue
                relative_path = os.path.relpath(source_path, record.mount.directory)
                paths.add(_join_url_path(record.mount.urlPath, relative_path))
    return paths


def _collect_files(
    router: Router,
    route_contexts: list[object],
    records: list[_StaticRecord],
    *,
    ambiguous: bool,
) -> list[StaticFile]:
    files: list[StaticFile] = []
    for path in sorted(_candidate_paths(records)):
        get_record = _select_record(
            router,
            route_contexts,
            records,
            path,
            "GET",
            ambiguous=ambiguous,
        )
        if get_record is None:
            continue
        head_record = _select_record(
            router,
            route_contexts,
            records,
            path,
            "HEAD",
            ambiguous=ambiguous,
        )
        if head_record is not get_record:
            continue
        source_path = _lookup_file(get_record, path)
        if source_path is None:
            continue
        files.append(StaticFile(urlPath=path, sourcePath=source_path))
    return files


def write_output(output_path: str, data: StaticDiscovery) -> None:
    with open(output_path, "w") as f:
        json.dump(asdict(data), f)


def main() -> None:
    entrypoint_abs = sys.argv[1]
    variable_name = sys.argv[2]
    output_path = sys.argv[3]

    spec = importlib.util.spec_from_file_location("__vc_app", entrypoint_abs)
    if spec is None or spec.loader is None:
        write_output(output_path, StaticDiscovery(mounts=[], files=[]))
        return

    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)  # type: ignore[union-attr]
    except Exception as exc:
        print(f"vc_fastapi_static: exec_module failed: {exc}", file=sys.stderr)
        write_output(output_path, StaticDiscovery(mounts=[], files=[]))
        return

    app = getattr(mod, variable_name, None)
    router = getattr(app, "router", None)
    if not isinstance(router, Router):
        write_output(output_path, StaticDiscovery(mounts=[], files=[]))
        return

    route_contexts = _route_contexts(router)
    normal_records, ambiguous = _collect_normal_records(route_contexts)
    records = normal_records + _collect_frontend_records(router)
    write_output(
        output_path,
        StaticDiscovery(
            mounts=[record.mount for record in records],
            files=_collect_files(
                router,
                route_contexts,
                records,
                ambiguous=ambiguous,
            ),
        ),
    )


main()
