"""
Discover application routes and StaticFiles mounts in a FastAPI/Starlette app
by importing the user's app object and walking its route table. Writes a JSON
object containing `staticMounts` and `routes` arrays to the output file.

Usage: python <this_script> <entrypoint_abs_path> <variable_name> <output_path>
"""

from __future__ import annotations

import importlib
import json
import os
import re
import sys
from dataclasses import asdict, dataclass
from typing import TYPE_CHECKING

from starlette.routing import BaseRoute, Mount, Router, WebSocketRoute
from starlette.staticfiles import StaticFiles

if TYPE_CHECKING:
    from fastapi.routing import _EffectiveRouteContext, _FrontendRouteGroup


@dataclass
class StaticMount:
    urlPath: str
    directory: str

    @classmethod
    def from_route(cls, route: Mount, prefix: str = "") -> StaticMount | None:
        static_app = route.app
        if not isinstance(static_app, StaticFiles):
            return None
        directory = static_app.directory
        if directory is None:
            return None
        return cls(
            urlPath=prefix + route.path,
            directory=os.path.abspath(str(directory)),
        )


@dataclass
class ApplicationRoute:
    source: str
    src: str
    methods: list[str]


def get_low_priority_routes(router: Router) -> list[_FrontendRouteGroup]:
    return getattr(router, "_low_priority_routes", [])


def get_effective_low_priority_routes(route: BaseRoute) -> list[_EffectiveRouteContext]:
    if fn := getattr(route, "effective_low_priority_routes", None):
        return fn()
    return []


def get_effective_application_routes(route: BaseRoute) -> list[object]:
    if fn := getattr(route, "effective_route_contexts", None):
        return list(fn())
    return [route]


def collect_mounts(router: Router, prefix: str = "") -> list[StaticMount]:
    mounts = []

    for route in router.routes:
        # app.mount("/path", StaticFiles(...))
        if isinstance(route, Mount):
            if m := StaticMount.from_route(route, prefix):
                mounts.append(m)
            if isinstance(route.app, Router):
                sub_prefix = prefix + route.path.rstrip("/")
                mounts.extend(collect_mounts(route.app, sub_prefix))

        # app.include_router(router, prefix="/path")
        for ctx in get_effective_low_priority_routes(route):
            for r in ctx.original_route.routes:
                if m := StaticMount.from_route(r, ctx.frontend_prefix):
                    mounts.append(m)

    # app.frontend()
    for group in get_low_priority_routes(router):
        for route in group.routes:
            if m := StaticMount.from_route(route, prefix):
                mounts.append(m)

    return mounts


def to_ecmascript_regex(pattern: str) -> str:
    # Starlette uses Python named capture groups. Vercel only needs the route
    # to match because the original request URL is forwarded unchanged, so
    # make those groups non-capturing and keep the converter regex intact.
    return re.sub(r"\(\?P<[^>]+>", "(?:", pattern)


def application_route_from_candidate(candidate: object) -> ApplicationRoute | None:
    original_route = getattr(candidate, "original_route", candidate)
    if isinstance(original_route, WebSocketRoute):
        return None

    # StaticFiles and app.frontend() routes are represented by CDN files and
    # must remain after application routes in the Vercel route table.
    if isinstance(original_route, Mount) and isinstance(
        original_route.app, StaticFiles
    ):
        return None

    effective_route = getattr(candidate, "starlette_route", None) or candidate
    path_regex = getattr(effective_route, "path_regex", None)
    source = getattr(effective_route, "path", None)
    if path_regex is None or not isinstance(source, str):
        return None

    methods = sorted(getattr(effective_route, "methods", None) or [])
    return ApplicationRoute(
        source=source,
        src=to_ecmascript_regex(path_regex.pattern),
        methods=methods,
    )


def collect_application_routes(router: Router) -> list[ApplicationRoute]:
    routes_by_src: dict[str, ApplicationRoute] = {}
    for route in router.routes:
        for candidate in get_effective_application_routes(route):
            if discovered := application_route_from_candidate(candidate):
                existing = routes_by_src.get(discovered.src)
                if existing is None:
                    routes_by_src[discovered.src] = discovered
                else:
                    existing.methods = sorted(
                        set(existing.methods).union(discovered.methods)
                    )
    return list(routes_by_src.values())


def write_output(output_path: str, data: object) -> None:
    with open(output_path, "w") as f:
        json.dump(data, f)


def main() -> None:
    entrypoint_abs = sys.argv[1]
    variable_name = sys.argv[2]
    output_path = sys.argv[3]

    work_path = os.getcwd()
    entrypoint_rel = os.path.relpath(entrypoint_abs, work_path)
    module_name = os.path.splitext(entrypoint_rel)[0].replace(os.sep, ".")
    if module_name.endswith(".__init__"):
        module_name = module_name[: -len(".__init__")]
    sys.path.insert(0, work_path)
    try:
        mod = importlib.import_module(module_name)
    except Exception as exc:
        print(f"vc_fastapi_static: exec_module failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc

    app = getattr(mod, variable_name, None)
    if app is None:
        write_output(output_path, {"staticMounts": [], "routes": []})
        return

    mounts = []
    routes = []
    if router := getattr(app, "router", None):
        mounts = collect_mounts(router)
        routes = collect_application_routes(router)

    write_output(
        output_path,
        {
            "staticMounts": [asdict(m) for m in mounts],
            "routes": [asdict(r) for r in routes],
        },
    )


main()
