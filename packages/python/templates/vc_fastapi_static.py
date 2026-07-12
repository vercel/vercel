"""
Discover StaticFiles mounts in a FastAPI/Starlette app by importing the user's
app object and walking its route table. Writes a JSON array of
{"urlPath": str, "directory": str} objects to the output file.

Usage: python <this_script> <entrypoint_abs_path> <variable_name> <output_path>
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
from dataclasses import asdict, dataclass
from typing import TYPE_CHECKING, cast

from starlette.routing import BaseRoute, Mount, Router
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


def get_low_priority_routes(router: Router) -> list[_FrontendRouteGroup]:
    return getattr(router, "_low_priority_routes", [])


def get_effective_low_priority_routes(route: BaseRoute) -> list[_EffectiveRouteContext]:
    if fn := getattr(route, "effective_low_priority_routes", None):
        return fn()
    return []


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


def write_output(output_path: str, data: list[object]) -> None:
    with open(output_path, "w") as f:
        json.dump(data, f)


def main() -> None:
    entrypoint_abs = sys.argv[1]
    variable_name = sys.argv[2]
    output_path = sys.argv[3]

    spec = importlib.util.spec_from_file_location("__vc_app", entrypoint_abs)
    if spec is None or spec.loader is None:
        write_output(output_path, [])
        return

    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)  # type: ignore[union-attr]
    except Exception as exc:
        print(f"vc_fastapi_static: exec_module failed: {exc}", file=sys.stderr)
        write_output(output_path, [])
        return

    app = getattr(mod, variable_name, None)
    if app is None:
        write_output(output_path, [])
        return

    mounts = []
    if router := getattr(app, "router", None):
        mounts = collect_mounts(router)

    write_output(output_path, [asdict(m) for m in mounts])


main()
