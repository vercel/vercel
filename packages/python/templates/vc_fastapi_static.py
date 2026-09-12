"""
Discover StaticFiles mounts in a FastAPI/Starlette app by importing the user's
app object and walking its route table.

Writes a JSON object to the output file:

    {
      "mounts": [
        {"urlPath": str, "directory": str,
         "fallback": {"file": str, "status": int} | null,
         "frontend": bool}
      ],
      "shadowRoutes": [str, ...]
    }

- "mounts" are StaticFiles / frontend directories to copy to the CDN;
  "frontend" marks a low-priority app.frontend() build.
- "mounts[].fallback" is the resolved frontend fallback file to serve for
  unmatched paths under that mount ("index.html"/"404.html"), or null for a
  plain `app.mount(StaticFiles(...))`.
- "shadowRoutes" are routing patterns (regex bodies, matched against the request
  path minus its leading slash) for paths a higher-priority route owns and that
  must therefore be routed to the app (Lambda) BEFORE the CDN. This preserves
  FastAPI precedence:
    * app.mount():   routes declared BEFORE the mount win (evaluated in order).
    * app.frontend(): all normal routes win (the build is low-priority).

Mounts are suppressed (omitted from output) when the app or a mounted sub-app
has user-defined middleware, because CDN-served files bypass the middleware
stack. Suppression can be disabled by passing "0" as the sixth argument (set
when [tool.vercel.fastapi.static] cdn = true in pyproject.toml).

Usage:
    python <this_script> <variable_name> <output_path> <project_root> <module_name> <suppress_middleware_mounts>
"""

from __future__ import annotations

import importlib
import json
import os
import re
import sys
from dataclasses import asdict, dataclass, field
from functools import cached_property
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
    """One mount for the "mounts" JSON array; field names are the JSON keys."""

    urlPath: str
    directory: str
    fallback: Fallback | None = None
    frontend: bool = False

    @classmethod
    def from_route(
        cls, route: BaseRoute, prefix: str = "", *, frontend: bool
    ) -> StaticMount | None:
        # Duck-typed on `path`/`app`: matches both a Mount and fastapi's
        # _FrontendRoute (a BaseRoute that is not a Mount subclass).
        static_app = getattr(route, "app", None)
        path = getattr(route, "path", None)
        if not isinstance(static_app, StaticFiles) or path is None:
            return None
        directory = static_app.directory
        if directory is None:
            return None
        return cls(
            urlPath=(prefix + path).rstrip("/") or "/",
            directory=os.path.abspath(str(directory)),
            fallback=_resolve_fallback(static_app),
            frontend=frontend,
        )


def _resolve_fallback(static_app: StaticFiles) -> Fallback | None:
    """Resolve a frontend StaticFiles fallback setting to a concrete file.

    Plain `StaticFiles` mounts have no `fallback` attribute and return None.
    `app.frontend(..., fallback=...)` uses "auto" | "index.html" | "404.html" |
    None; in "auto" mode 404.html (served for every miss) takes precedence over
    index.html, mirroring the runtime behavior.
    """
    fallback = getattr(static_app, "fallback", None)
    if not fallback or static_app.directory is None:
        return None
    directory = str(static_app.directory)

    def exists(name: str) -> bool:
        return os.path.isfile(os.path.join(directory, name))

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
    """Make a convertor regex safe to embed: turn capturing and named groups
    into `(?:`. Escaped parens and other `(?...)` groups are left alone; named
    groups are normalized because duplicate names across OR'd bodies are invalid.
    """

    def repl(m: re.Match[str]) -> str:
        return m.group(0) if m.group(0).startswith("\\") else "(?:"

    return re.sub(r"\\.|\(\?P<[^>]+>|\((?!\?)", repl, regex)


def _escape_path(path: str) -> str:
    """A literal URL path as a shadow body, with boundary slashes removed.

    The builder wraps every body as `^/(<body>)/?$` (see `fastapiShadowingRoutes`),
    so it owns the leading slash and an optional trailing one. Bodies therefore
    carry only the inner segments.
    """
    return _escape(path.strip("/"))


def _subtree_shadow(prefix: str, mounts: list[StaticMount]) -> str:
    """A shadow body routing a mounted sub-app's whole subtree to the Lambda.

    The app owns `prefix` (e.g. "/sub") at runtime, so everything under it is
    shadowed, including the bare mount root ("/sub" itself, which the app 307s
    to "/sub/"), except the nested StaticFiles `mounts` discovered inside it,
    which stay on the CDN and are excluded via a negative lookahead.

    A nested mount at the sub-app root ("") owns the entire subtree, so the CDN
    serves all of it and the sub-app's routes carry their own shadow bodies.
    Only the bare mount root is shadowed then.
    """
    start = len(prefix) + 1
    nested = [m.urlPath[start:] for m in mounts]
    base = _escape_path(prefix)
    if "" in nested:
        return base
    guard = ""
    if nested:
        alternatives = "|".join(_escape(n) for n in nested)
        guard = f"(?!(?:{alternatives})(?:/|$))"
    if base == "":
        # Root mount ("/"): the builder adds the leading slash, so the body is
        # the guarded rest of the path.
        return f"{guard}.*"
    # The tail is optional so the bare mount root ("/sub") is shadowed too, not
    # only paths under it ("/sub/...").
    return f"{base}(?:/{guard}.*)?"


def _index_subdir_shadows(url_prefix: str, directory: str) -> set[str]:
    """Regex bodies for subdirectories that hold an index.html.

    A directory with an index.html diverges on the CDN. StaticFiles(html=True)
    and frontends 307 the bare directory URL to its trailing-slash form and serve
    the index there; StaticFiles(html=False) 404s both forms. The CDN instead
    serves the index at the bare path with the wrong relative-URL base, or misses
    it. Shadow each such subdirectory so the Lambda matches the app; the files
    below it stay on the CDN. The mount root is `_divergent_url_shadows`'s job.
    """
    shadows: set[str] = set()
    for dirpath, _dirnames, filenames in os.walk(directory):
        if "index.html" not in filenames:
            continue
        rel = os.path.relpath(dirpath, directory)
        if rel == ".":
            continue
        shadows.add(_escape_path(url_prefix + "/" + rel.replace(os.sep, "/")))
    return shadows


def _divergent_url_shadows(mount: StaticMount, html: bool) -> list[ShadowRoute]:
    """Shadow routes for directory URLs the CDN and the app serve differently.

    When a directory holds an index.html, the app and the CDN serve that
    directory's URL differently. This affects every such subdirectory and the
    mount root. A root "/" html mount is the exception: it serves its index at
    "/" with no redirect, so the app and the CDN already agree.

    html=True and frontends shadow only the bare form. The CDN serves the index
    at the trailing-slash form too, matching the app's 200, so that form stays
    on the CDN. The app 307s the bare form while the CDN serves the index in
    place, so the bare form must reach the Lambda. The `(?!/)` suffix stops the
    builder's `/?` wrap from also matching the slash form.

    html=False shadows both forms. The app 404s both while the CDN serves the
    index, so both must reach the Lambda.

    Directory redirects are GET-only: HEAD for bare dirs is handled by the
    builder's CDN redirect routes placed before shadow routes.
    """
    bodies = _index_subdir_shadows(mount.urlPath, mount.directory)
    if not (html and mount.urlPath == "/"):
        bodies.add(_escape_path(mount.urlPath))
    if html:
        bodies = {f"{body}(?!/)" for body in bodies}
    return [ShadowRoute(body=body, methods=("GET",)) for body in bodies]


def _frontend_groups(router: Router) -> list[_FrontendRouteGroup]:
    """app.frontend() builds, kept off the route table as low-priority routes."""
    return getattr(router, "_low_priority_routes", [])


def _frontend_has_dependencies(source: object) -> bool:
    """True if FastAPI dependencies (e.g. Depends(auth)) guard a frontend build.

    _FrontendRouteGroup.handle solves the dependant's dependencies before serving
    a file, so a guarded build gates every file and fallback at runtime. The CDN
    cannot run dependencies, so a guarded build is neither copied nor given a
    fallback; it stays on the Lambda, which enforces the check.
    """
    dependant = getattr(source, "dependant", None)
    return bool(dependant and getattr(dependant, "dependencies", None))


def _effective_low_priority_routes(route: BaseRoute) -> list[_EffectiveRouteContext]:
    if fn := getattr(route, "effective_low_priority_routes", None):
        return fn()
    return []


def _effective_route_contexts(route: BaseRoute) -> list[_EffectiveRouteContext]:
    """`app.include_router(...)` surfaces its (prefixed) routes here rather than
    flattening them into the parent table, so this is how we see them.
    """
    if fn := getattr(route, "effective_route_contexts", None):
        return fn()
    return []


@dataclass(frozen=True)
class ShadowRoute:
    """One shadow-route entry in the builder output.

    `body` is the regex body for the route src; `methods` is the list of HTTP
    methods the shadow applies to (from the API route that declared it), or
    None when the shadow must match all methods.
    """

    body: str
    methods: tuple[str, ...] | None  # sorted tuple, or None for all

    def to_dict(self) -> dict[str, object]:
        return {"body": self.body, "methods": list(self.methods) if self.methods is not None else None}


@dataclass(frozen=True)
class PriorRoute:
    """An HTTP route that outranks static files.

    Any static file whose path this route matches must be served by the app
    (Lambda), not the CDN, so FastAPI's declaration-order precedence is
    preserved. `path_format` is the full route path (e.g. "/items/{id}") and
    `convertors` maps each `{name}` placeholder to its Starlette convertor.
    `methods` is the set of HTTP methods the route handles, or None for all.
    """

    path_format: str
    convertors: dict[str, Convertor]
    methods: frozenset[str] | None = None

    def shadows(self, mount: StaticMount) -> bool:
        """True if this route can match paths the mount serves.

        The mount's URL-prefix segments are walked against the route's: a
        literal route segment must equal the mount's, a `{param}` covers one
        segment, and a `{param:path}` covers this segment and everything after.
        So a param in or above the prefix (`/{full:path}`, `/{x}/items`) still
        shadows. Matching broader than the route's exact runtime matches only
        over-shadows (routes extra paths to the Lambda, which serves the same
        content), never under.
        """
        base = mount.urlPath.rstrip("/")
        if base == "":
            return True
        route_segments = self.path_format.strip("/").split("/")
        convertors = self.convertors or {}
        for i, mount_segment in enumerate(base.strip("/").split("/")):
            if i >= len(route_segments):
                return False
            names = _PARAM_RE.findall(route_segments[i])
            if not names:
                if route_segments[i] != mount_segment:
                    return False
                continue
            if any(isinstance(convertors.get(n), PathConvertor) for n in names):
                return True
        return True

    @cached_property
    def shadow_body(self) -> str:
        """This route's path as a `shadowRoutes` regex body.

        Literal text is escaped and each `{name}` placeholder becomes its
        Starlette convertor regex (str -> `[^/]+`, int -> `[0-9]+`, …), so the
        route shadows exactly the paths it matches. Inner groups are made
        non-capturing so the builder can wrap the whole body in one capture
        group. Boundary slashes are stripped upfront because the builder's wrap
        owns them (see `_escape_path`).
        """
        path = self.path_format.strip("/")
        parts: list[str] = []
        last = 0
        for m in _PARAM_RE.finditer(path):
            parts.append(_escape(path[last : m.start()]))
            convertor = (self.convertors or {}).get(m.group(1))
            regex = getattr(convertor, "regex", None) or "[^/]+"
            parts.append("(?:" + _to_non_capturing(regex) + ")")
            last = m.end()
        parts.append(_escape(path[last:]))
        return "".join(parts)


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

    def shadow_bodies(self, mount: StaticMount) -> list[ShadowRoute]:
        """Shadow-route body+methods for every prior route that shadows `mount`.

        When a route declares GET, HEAD is added to the shadow methods. HTTP
        semantics tie HEAD to GET, so the Lambda (not the CDN) should handle
        HEAD on API-owned paths and return 405 when HEAD is not declared.
        """
        result = []
        for r in self.routes:
            if not r.shadows(mount):
                continue
            methods = r.methods
            # With plain StaticFiles, HEAD bypasses the GET route and the
            # mount serves it (200), so CDN can do the same without Lambda.
            # With app.frontend(), HEAD on a GET route path returns 405.
            # Shadow HEAD only for frontend mounts.
            if methods is not None and "GET" in methods and mount.frontend:
                methods = methods | {"HEAD"}
            result.append(
                ShadowRoute(
                    body=r.shadow_body,
                    methods=tuple(sorted(methods)) if methods is not None else None,
                )
            )
        return result

    def add_mount(self, url_prefix: str) -> None:
        self.mount_prefixes.append(url_prefix.rstrip("/"))

    def eclipses(self, url_prefix: str) -> bool:
        """True if an earlier mount already owns `url_prefix`'s whole subtree."""
        p = url_prefix.rstrip("/")
        return any(p == q or p.startswith(q + "/") for q in self.mount_prefixes)


def _subtree_shadow_route(prefix: str, mounts: list[StaticMount]) -> ShadowRoute:
    """A ShadowRoute routing a mounted sub-app's whole subtree to the Lambda."""
    return ShadowRoute(body=_subtree_shadow(prefix, mounts), methods=None)


def _collect_mount(
    route: Mount,
    prefix: str,
    prior: Precedence,
    *,
    has_middleware: bool,
    suppress_middleware_mounts: bool,
) -> tuple[list[StaticMount], list[ShadowRoute]]:
    """Discover one app.mount(): a StaticFiles mount serves from the CDN, a
    Router/sub-app recurses, and a raw ASGI app owns its subtree opaquely.
    """
    url_prefix = prefix + route.path
    if prior.eclipses(url_prefix):
        return [], []

    if suppress_middleware_mounts:
        has_middleware = has_middleware or bool(getattr(route.app, "user_middleware", []))

    mounts: list[StaticMount] = []
    shadow_routes: list[ShadowRoute] = []

    static = StaticMount.from_route(route, prefix, frontend=False)
    if static and not has_middleware:
        mounts.append(static)
        shadow_routes += prior.shadow_bodies(static)
        shadow_routes += _divergent_url_shadows(static, html=route.app.html)

    # A Starlette/FastAPI sub-app isn't a Router but exposes one as `.router`;
    # a StaticFiles or raw ASGI app exposes neither.
    sub_router = (
        route.app
        if isinstance(route.app, Router)
        else getattr(route.app, "router", None)
    )
    if isinstance(sub_router, Router):
        # Recurse for the sub-app's own StaticFiles mounts, then shadow the
        # rest of its subtree to the Lambda.
        sub_prefix = prefix + route.path.rstrip("/")
        sub_mounts, sub_shadow = collect(
            sub_router,
            sub_prefix,
            prior,
            has_middleware=has_middleware,
            suppress_middleware_mounts=suppress_middleware_mounts,
        )
        mounts.extend(sub_mounts)
        shadow_routes += sub_shadow
        shadow_routes.append(_subtree_shadow_route(sub_prefix, sub_mounts))
    elif static is None:
        # A raw ASGI app (e.g. WSGIMiddleware) owns its subtree with nothing on
        # the CDN. Shadow it so a lower-priority source's leaked copy there
        # routes to the Lambda.
        shadow_routes.append(_subtree_shadow_route(url_prefix, []))

    prior.add_mount(url_prefix)
    return mounts, shadow_routes


def collect(
    router: Router,
    prefix: str = "",
    prior: Precedence | None = None,
    *,
    has_middleware: bool,
    suppress_middleware_mounts: bool,
) -> tuple[list[StaticMount], list[ShadowRoute]]:
    """Walk the route table for (static mounts to copy, shadow routes).

    Shadow routes are merged so that the same path covered by multiple API
    routes with different methods produces one entry with the union of methods.
    """
    prior = prior.child() if prior else Precedence()

    mounts: list[StaticMount] = []
    shadow_routes: list[ShadowRoute] = []
    frontends: list[StaticMount] = []

    def _route_methods(route: Route) -> frozenset[str] | None:
        """HTTP methods for a Starlette Route, or None for no restriction."""
        m = getattr(route, "methods", None)
        return frozenset(m) if m else None

    def collect_mount(mount_route: Mount) -> None:
        sub_mounts, sub_shadow = _collect_mount(
            mount_route, prefix, prior,
            has_middleware=has_middleware,
            suppress_middleware_mounts=suppress_middleware_mounts,
        )
        mounts.extend(sub_mounts)
        shadow_routes.extend(sub_shadow)

    for route in router.routes:
        if isinstance(route, Route):
            prior.add_route(
                PriorRoute(prefix + route.path_format, route.param_convertors, _route_methods(route))
            )
        elif isinstance(route, Mount):
            collect_mount(route)

        # app.include_router(): harvest its effective routes, prefixed with this
        # router's prefix so a route inside a mounted sub-app shadows the right
        # subtree. A Mount surfaces here too (router.mount() then
        # app.include_router()): ctx.starlette_route is a Mount copy with the
        # prefixed path, collected like a direct app.mount().
        for ctx in _effective_route_contexts(route):
            if isinstance(ctx.original_route, Mount):
                if isinstance(ctx.starlette_route, Mount):
                    collect_mount(ctx.starlette_route)
            elif isinstance(ctx.original_route, Route):
                # An APIRoute carries its path on ctx; a plain Starlette route
                # only on its compiled starlette_route.
                if ctx.starlette_route is not None:
                    path = ctx.starlette_route.path_format
                    convertors = ctx.starlette_route.param_convertors
                    methods = _route_methods(ctx.starlette_route)
                else:
                    path = ctx.path
                    convertors = ctx.param_convertors
                    methods = _route_methods(ctx.original_route)
                prior.add_route(PriorRoute(prefix + path, convertors, methods))

        # app.include_router() with a frontend build.
        for ctx in _effective_low_priority_routes(route):
            if suppress_middleware_mounts and (_frontend_has_dependencies(ctx) or has_middleware):
                continue
            for r in ctx.original_route.routes:
                if m := StaticMount.from_route(
                    r, prefix + ctx.frontend_prefix, frontend=True
                ):
                    frontends.append(m)

    # app.frontend() builds.
    for group in _frontend_groups(router):
        if suppress_middleware_mounts and (_frontend_has_dependencies(group) or has_middleware):
            continue
        for route in group.routes:
            if m := StaticMount.from_route(route, prefix, frontend=True):
                frontends.append(m)

    # A frontend is low-priority: every route shadows it, and one whose prefix
    # an earlier mount owns is unreachable (Starlette dispatches to the mount
    # and never consults the build), so it is dropped entirely — mount,
    # fallback, and shadows.
    for m in frontends:
        if prior.eclipses(m.urlPath):
            continue
        mounts.append(m)
        shadow_routes += prior.shadow_bodies(m)
        # A frontend is html=True StaticFiles, so its URLs diverge the same way.
        shadow_routes += _divergent_url_shadows(m, html=True)

    return mounts, _merge_shadow_routes(shadow_routes)


def _merge_shadow_routes(routes: list[ShadowRoute]) -> list[ShadowRoute]:
    """Combine shadow routes that share a body by unioning their methods.

    When the same path is covered by multiple API routes with different methods
    (e.g. @app.get and @app.post on the same path), each produces a separate
    ShadowRoute. Merging them emits one CDN route whose `methods` covers all
    the declared methods. A None methods entry (match-all) subsumes any
    specific set.
    """
    merged: dict[str, frozenset[str] | None] = {}
    for route in routes:
        methods = frozenset(route.methods) if route.methods is not None else None
        if route.body not in merged:
            merged[route.body] = methods
        else:
            existing = merged[route.body]
            if existing is None or methods is None:
                merged[route.body] = None  # match-all subsumes everything
            else:
                merged[route.body] = existing | methods
    return sorted(
        [
            ShadowRoute(
                body=body,
                methods=tuple(sorted(m)) if m is not None else None,
            )
            for body, m in merged.items()
        ],
        key=lambda sr: sr.body,
    )


@dataclass(frozen=True)
class Output:
    """The JSON document written for the builder; field names are the JSON keys.

    Each shadowRoutes entry is {"body": str, "methods": list[str] | None}.
    `methods=None` means the shadow applies to all HTTP methods.
    """

    mounts: list[StaticMount] = field(default_factory=list)
    shadowRoutes: list[ShadowRoute] = field(default_factory=list)

    def to_dict(self) -> dict[str, object]:
        return {
            "mounts": [asdict(m) for m in self.mounts],
            "shadowRoutes": [sr.to_dict() for sr in self.shadowRoutes],
        }


def write_output(output_path: str, discovery: Output) -> None:
    with open(output_path, "w") as f:
        json.dump(discovery.to_dict(), f)


def discover(variable_name: str, project_root: str, module_name: str, suppress_middleware_mounts: bool) -> Output:
    """Import the entrypoint as its real module and walk its app's router.

    The project root is put on sys.path so importlib.import_module loads the
    entrypoint by its dotted name (as the deployed runtime does), which is what
    makes relative and first-party absolute imports resolve. Returns empty on
    any failure.
    """
    if project_root and project_root not in sys.path:
        sys.path.insert(0, project_root)

    try:
        mod = importlib.import_module(module_name)
    except Exception as exc:
        print(f"vc_fastapi_static: import failed: {exc}", file=sys.stderr)
        return Output()

    app = getattr(mod, variable_name, None)
    router = getattr(app, "router", None)
    if router is None:
        return Output()

    # If the top-level app has middleware, no mounts can be promoted —
    # CDN-served files would bypass the middleware stack entirely.
    if suppress_middleware_mounts and getattr(app, "user_middleware", []):
        return Output()

    mounts, shadow_routes = collect(
        router, has_middleware=False, suppress_middleware_mounts=suppress_middleware_mounts
    )
    return Output(mounts=mounts, shadowRoutes=shadow_routes)


def main() -> None:
    variable_name, output_path, project_root, module_name = sys.argv[1:5]
    suppress_middleware_mounts = sys.argv[5] != "0"
    write_output(output_path, discover(variable_name, project_root, module_name, suppress_middleware_mounts))


if __name__ == "__main__":
    main()
