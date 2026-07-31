"""
Discover StaticFiles mounts in a FastAPI/Starlette app by importing the user's
app object and walking its route table.

Writes a JSON object to the output file:

    {
      "mounts": [
        {"urlPath": str, "directory": str,
         "fallback": {"file": str, "status": int} | null}
      ],
      "shadowRoutes": [str, ...]
    }

- "mounts" are StaticFiles / frontend directories to copy to the CDN.
- "mounts[].fallback" is the resolved frontend fallback file to serve for
  unmatched paths under that mount ("index.html"/"404.html"), or null for a
  plain `app.mount(StaticFiles(...))`.
- "shadowRoutes" are routing patterns (regex bodies, matched against the request
  path minus its leading slash) for paths a higher-priority route owns and that
  must therefore be routed to the app (Lambda) BEFORE the CDN. Derived from the
  route table alone (no filesystem access). This preserves FastAPI precedence:
    * app.mount():   routes declared BEFORE the mount win (evaluated in order).
    * app.frontend(): all normal routes win (the build is low-priority).

Usage:
    python <this_script> <entrypoint_abs> <variable_name> <output_path> \
        <project_root> <module_name>
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import sys
from dataclasses import asdict, dataclass, field
from typing import TYPE_CHECKING

from starlette.convertors import Convertor, PathConvertor
from starlette.routing import BaseRoute, Mount, Route, Router
from starlette.staticfiles import StaticFiles

if TYPE_CHECKING:
    from fastapi.routing import _EffectiveRouteContext, _FrontendRouteGroup


@dataclass(frozen=True)
class Fallback:
    file: str
    status: int


@dataclass(frozen=True)
class StaticMount:
    urlPath: str
    directory: str
    fallback: Fallback | None = None

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
            fallback=_resolve_fallback(static_app),
        )


def _resolve_fallback(static_app: StaticFiles) -> Fallback | None:
    """Resolve a frontend StaticFiles fallback setting to a concrete file.

    Plain `StaticFiles` mounts have no `fallback` attribute and return None.
    `app.frontend(..., fallback=...)` uses "auto" | "index.html" | "404.html" |
    None; in "auto" mode 404.html (served for every miss) takes precedence over
    index.html, mirroring the runtime behavior.
    """
    fallback = getattr(static_app, "fallback", None)
    if not fallback:
        return None
    directory = static_app.directory

    def exists(name: str) -> bool:
        return directory is not None and os.path.isfile(
            os.path.join(str(directory), name)
        )

    if fallback == "404.html" or (fallback == "auto" and exists("404.html")):
        return Fallback(file="404.html", status=404)
    if fallback == "index.html" or (fallback == "auto" and exists("index.html")):
        return Fallback(file="index.html", status=200)
    return None


# Regex-special characters, matching the JS `escapeRegExp` used in the builder.
_ESCAPE_RE = re.compile(r"[.*+?^${}()|[\]\\]")
# A `{name}` or `{name:convertor}` path placeholder; group 1 is the bare name
# (top-level routes drop the convertor, an included router's paths keep it).
_PARAM_RE = re.compile(r"\{([^}:]+)(?::[^}]+)?\}")


def _escape(text: str) -> str:
    return _ESCAPE_RE.sub(lambda m: "\\" + m.group(0), text)


def _to_non_capturing(regex: str) -> str:
    """Make a convertor regex safe to embed: turn `(` groups into `(?:`."""
    return re.sub(r"\((?!\?)", "(?:", regex)


def get_low_priority_routes(router: Router) -> list[_FrontendRouteGroup]:
    return getattr(router, "_low_priority_routes", [])


def get_effective_low_priority_routes(route: BaseRoute) -> list[_EffectiveRouteContext]:
    if fn := getattr(route, "effective_low_priority_routes", None):
        return fn()
    return []


def get_effective_route_contexts(route: BaseRoute) -> list[_EffectiveRouteContext]:
    # `app.include_router(...)` surfaces its (prefixed) routes here rather than
    # flattening them into the parent table, so this is how we see them.
    if fn := getattr(route, "effective_route_contexts", None):
        return fn()
    return []


@dataclass(frozen=True)
class PriorRoute:
    """An HTTP route that outranks static files.

    Any static file whose path this route matches must be served by the app
    (Lambda), not the CDN, so FastAPI's declaration-order precedence is
    preserved. `path_format` is the full route path (e.g. "/items/{id}") and
    `convertors` maps each `{name}` placeholder to its Starlette convertor.
    """

    path_format: str
    convertors: dict[str, Convertor]

    def shadows(self, mount: StaticMount) -> bool:
        """True if this route can match paths the mount serves.

        The mount's URL-prefix segments are walked against the route's: a
        literal route segment must equal the mount's, a `{param}` covers one
        segment, and a `{param:path}` covers this segment and everything after.
        So a param in or above the prefix (`/{full:path}`, `/{x}/items`) still
        shadows — a plain `str.startswith` on the path missed those. Matching
        broader than the route's exact runtime matches only over-shadows (routes
        extra paths to the Lambda, which serves the same content), never under.
        """
        base = mount.urlPath.rstrip("/")
        if base == "":
            return True  # root mount serves every path
        mount_segments = base.strip("/").split("/")
        route_segments = self.path_format.strip("/").split("/")
        convertors = self.convertors or {}
        for i, mount_segment in enumerate(mount_segments):
            if i >= len(route_segments):
                return False  # route ends above the prefix; can't reach under it
            names = _PARAM_RE.findall(route_segments[i])
            if not names:
                if route_segments[i] != mount_segment:
                    return False  # literal mismatch: never matches under the mount
                continue
            if any(isinstance(convertors.get(n), PathConvertor) for n in names):
                return True  # `:path` swallows this segment and everything after
        return True

    def shadow_body(self) -> str:
        """This route's path as a `shadowRoutes` regex body (leading slash dropped).

        Literal text is escaped and each `{name}` placeholder becomes its Starlette
        convertor regex (str -> `[^/]+`, int -> `[0-9]+`, …), so the route shadows
        exactly the paths it matches. Inner groups are made non-capturing so the
        builder can wrap the whole body in one capture group.
        """
        parts: list[str] = []
        last = 0
        for m in _PARAM_RE.finditer(self.path_format):
            parts.append(_escape(self.path_format[last : m.start()]))
            convertor = self.convertors.get(m.group(1)) if self.convertors else None
            regex = getattr(convertor, "regex", None) or "[^/]+"
            parts.append("(?:" + _to_non_capturing(regex) + ")")
            last = m.end()
        parts.append(_escape(self.path_format[last:]))
        body = "".join(parts)
        return body[1:] if body.startswith("/") else body


@dataclass
class Precedence:
    """What has been declared *before* the current position and therefore
    outranks a static mount, in Starlette's first-match-wins order.

    Two independent effects:
      * `routes` — higher-precedence routes that SHADOW individual static paths
        (the path is routed to the app instead of served from the CDN).
      * `mount_prefixes` — earlier mount prefixes that ECLIPSE any later mount
        nested beneath them (the nested mount is unreachable, so it is dropped).

    Flows down into nested routers: a nested `collect` starts from `child()`, an
    independent copy, so its own additions never leak back to an ancestor.
    """

    routes: list[PriorRoute] = field(default_factory=list)
    mount_prefixes: list[str] = field(default_factory=list)

    def child(self) -> Precedence:
        return Precedence(list(self.routes), list(self.mount_prefixes))

    def add_route(self, route: PriorRoute) -> None:
        self.routes.append(route)

    def shadow_bodies(self, mount: StaticMount) -> set[str]:
        """Shadow-route bodies for every prior route that shadows `mount`."""
        return {r.shadow_body() for r in self.routes if r.shadows(mount)}

    def add_mount(self, url_prefix: str) -> None:
        self.mount_prefixes.append(url_prefix.rstrip("/"))

    def eclipses(self, url_prefix: str) -> bool:
        """True if an earlier mount already owns `url_prefix`'s whole subtree."""
        p = url_prefix.rstrip("/")
        return any(p == q or p.startswith(q + "/") for q in self.mount_prefixes)


def collect(
    router: Router,
    prefix: str = "",
    prior: Precedence | None = None,
) -> tuple[list[StaticMount], set[str]]:
    # A private copy so our additions don't leak back to an ancestor.
    prior = prior.child() if prior else Precedence()

    mounts: list[StaticMount] = []
    shadow_routes: set[str] = set()

    # Frontends are low-priority (checked after every route); shadowed post-loop.
    frontends: list[StaticMount] = []

    for route in router.routes:
        if isinstance(route, Route):
            prior.add_route(
                PriorRoute(prefix + route.path_format, route.param_convertors)
            )

        # app.mount(StaticFiles): serve from the CDN, minus shadowed paths; drop
        # if an earlier mount eclipses it.
        if isinstance(route, Mount):
            url_prefix = prefix + route.path
            if not prior.eclipses(url_prefix):
                if m := StaticMount.from_route(route, prefix):
                    mounts.append(m)
                    shadow_routes |= prior.shadow_bodies(m)
                # app.mount(Router | sub-app): recurse into the sub-router so
                # its own StaticFiles mounts are found too. A Starlette/FastAPI
                # sub-application isn't a Router but exposes one as `.router`.
                sub_router = (
                    route.app
                    if isinstance(route.app, Router)
                    else getattr(route.app, "router", None)
                )
                if isinstance(sub_router, Router):
                    sub_prefix = prefix + route.path.rstrip("/")
                    sub_mounts, sub_shadow = collect(sub_router, sub_prefix, prior)
                    mounts.extend(sub_mounts)
                    shadow_routes |= sub_shadow
                # Now owns its subtree, eclipsing later mounts nested under it.
                prior.add_mount(url_prefix)

        # app.include_router(): its routes aren't in this table, so harvest their
        # effective paths (able to shadow a later sibling mount).
        for ctx in get_effective_route_contexts(route):
            if isinstance(ctx.original_route, Route):
                prior.add_route(
                    PriorRoute(ctx.path, ctx.param_convertors)
                )

        # app.include_router() with a frontend build (low-priority).
        for ctx in get_effective_low_priority_routes(route):
            for r in ctx.original_route.routes:
                if m := StaticMount.from_route(r, ctx.frontend_prefix):
                    mounts.append(m)
                    frontends.append(m)

    # app.frontend(): a low-priority build.
    for group in get_low_priority_routes(router):
        for route in group.routes:
            if m := StaticMount.from_route(route, prefix):
                mounts.append(m)
                frontends.append(m)

    # A frontend is outranked by every route, so shadow it against the full list.
    for m in frontends:
        shadow_routes |= prior.shadow_bodies(m)

    return mounts, shadow_routes


@dataclass(frozen=True)
class Output:
    """The JSON document written for the builder; field names are the JSON keys."""

    mounts: list[StaticMount] = field(default_factory=list)
    shadowRoutes: list[str] = field(default_factory=list)


def write_output(output_path: str, discovery: Output) -> None:
    with open(output_path, "w") as f:
        json.dump(asdict(discovery), f)


def main() -> None:
    entrypoint_abs = sys.argv[1]
    variable_name = sys.argv[2]
    output_path = sys.argv[3]
    project_root = sys.argv[4]
    module_name = sys.argv[5]

    # Import the entrypoint the way the deployed function does: as its real
    # dotted module, with the project root on sys.path and registered in
    # sys.modules. Loading it under a synthetic top-level name with no project
    # root importable would break both relative imports (`from .settings import
    # ...`) and first-party absolute imports (`import settings`), silently
    # yielding zero mounts so the frontend is served by the Lambda, not the CDN.
    # Mirrors vercel_runtime.resolver.import_module.
    if project_root and project_root not in sys.path:
        sys.path.insert(0, project_root)

    spec = importlib.util.spec_from_file_location(module_name, entrypoint_abs)
    if spec is None or spec.loader is None:
        write_output(output_path, Output())
        return

    mod = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = mod
    try:
        spec.loader.exec_module(mod)  # type: ignore[union-attr]
    except Exception as exc:
        print(f"vc_fastapi_static: exec_module failed: {exc}", file=sys.stderr)
        write_output(output_path, Output())
        return

    app = getattr(mod, variable_name, None)
    if app is None:
        write_output(output_path, Output())
        return

    discovery = Output()
    if router := getattr(app, "router", None):
        mounts, shadow_routes = collect(router)
        discovery = Output(mounts=mounts, shadowRoutes=sorted(shadow_routes))

    write_output(output_path, discovery)


main()
