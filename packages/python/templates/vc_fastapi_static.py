"""
Discover StaticFiles mounts in a FastAPI/Starlette app by importing the user's
app object and walking its route table.

Writes a JSON object to the output file:

    {
      "mounts": [
        {
          "urlPath": str,
          "directory": str,
          "fallback": {"file": str, "status": int} | null,
          "frontend": bool,
          "html": bool
        },
        ...
      ],
      "shadowRoutes": [
        {"body": str, "methods": [str] | null},
        ...
      ],
      "excludedFiles": [str, ...]
    }

- "mounts" are StaticFiles / frontend directories to copy to the CDN.
  "frontend" marks a low-priority app.frontend() build.
  "html" reflects the StaticFiles html mode (always True for frontends).
  "mounts[].fallback" is the resolved frontend fallback file to serve for
  unmatched paths under that mount ("index.html"/"404.html"), or null for a
  plain app.mount(StaticFiles(...)).
- "shadowRoutes" are pre-filesystem routing rules for paths that must reach
  the Lambda before the CDN can act. Each entry carries a regex body (matched
  against the request path minus its leading slash) and the HTTP methods it
  applies to (null means all methods).
- "excludedFiles" are CDN URL paths (with leading slash) of files in plain
  StaticFiles mounts that prior GET/HEAD app routes own. The builder withholds
  these from CDN copying so the Lambda catch-all serves them directly.

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
    html: bool = False

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
            html=static_app.html,
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


def _divergent_url_shadows(mount: StaticMount) -> list[ShadowRoute]:
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

    Shadows are all-methods: the Lambda 404s HEAD just as it does GET, which
    matches the real app. No CDN redirect routes are emitted for html=False
    mounts, so HEAD must be intercepted by the shadow.
    """
    if mount.html:
        return []  # bare-dir 307 redirects are emitted as static CDN rules by the builder
    bodies = _index_subdir_shadows(mount.urlPath, mount.directory)
    # Only needed when index.html is present at the root. Without it the
    # CDN has no implicit directory index to serve and misses naturally.
    if os.path.isfile(os.path.join(mount.directory, "index.html")):
        bodies.add(_escape_path(mount.urlPath))
    return [ShadowRoute(body=body, methods=None) for body in bodies]


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

    @cached_property
    def parametrized(self) -> bool:
        """True when the path has `{param}` placeholders that expand to regex groups."""
        return bool(_PARAM_RE.search(self.path_format))


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

        Used for frontend mounts: the frontend fallback in handle: 'miss'
        intercepts extension-less CDN misses and would serve index.html before
        the Lambda catch-all is reached. A pre-filesystem shadow ensures the
        Lambda handles these paths first.
        """
        result = []
        for r in self.routes:
            if not r.shadows(mount):
                continue
            methods = r.methods
            # HEAD on a GET-only route under a frontend returns 405 not 200,
            # so the Lambda must handle it rather than the CDN.
            if methods is not None and "GET" in methods and mount.frontend:
                methods = methods | {"HEAD"}
            result.append(
                ShadowRoute(
                    body=r.shadow_body,
                    methods=tuple(sorted(methods)) if methods is not None else None,
                )
            )
        return result

    def excluded_files(self, mount: StaticMount) -> set[str]:
        """CDN URL paths of files in `mount` that prior routes own.

        Returns URL paths to exclude from the CDN so the Lambda serves them.
        """
        relevant = [
            r for r in self.routes
            if r.shadows(mount)
            # Routes with no GET/HEAD methods leave their files on the CDN.
            and (r.methods is None or r.methods & {"GET", "HEAD"})
            # A trailing-slash route owns only the slash form; the bare-form
            # file stays on the CDN (see trailing_slash_shadows).
            and not (r.path_format.endswith("/") and r.path_format != "/")
        ]
        if not relevant:
            return set()

        literal_routes: list[PriorRoute] = []
        parametrized_bodies: list[str] = []
        for r in relevant:
            if r.parametrized:
                parametrized_bodies.append(r.shadow_body)
            else:
                literal_routes.append(r)

        excluded: set[str] = set()
        mount_prefix = mount.urlPath.strip("/")

        # Literal fast-path: check file existence directly from the route path.
        for r in literal_routes:
            rel = r.path_format[len(mount.urlPath.rstrip("/")) + 1:]
            if os.path.isfile(os.path.join(mount.directory, *rel.split("/"))):
                excluded.add(r.path_format)

        # Parametrized: one combined-regex pass over the directory tree.
        if parametrized_bodies:
            combined = re.compile("^(?:" + "|".join(parametrized_bodies) + ")$")
            for dirpath, _, filenames in os.walk(mount.directory):
                for filename in filenames:
                    rel = os.path.relpath(
                        os.path.join(dirpath, filename), mount.directory
                    ).replace(os.sep, "/")
                    url_body = f"{mount_prefix}/{rel}".lstrip("/")
                    if combined.match(url_body):
                        excluded.add("/" + url_body)

        return excluded

    def trailing_slash_shadows(self, mount: StaticMount) -> list[ShadowRoute]:
        """Slash-form shadows for trailing-slash routes whose bare path is a file.

        A route declared as @app.get("/mount/file/") owns the slash form of a
        path where a file sits at the bare form on the CDN. The file stays on
        the CDN; a slash-form shadow routes /mount/file/ to the Lambda before
        the CDN can serve it.

        A parametrized trailing-slash route owns the slash form of every path
        it matches, so its whole pattern is shadowed with no file check: slash
        forms without an underlying CDN file miss to the Lambda anyway, so the
        broad shadow only pre-empts paths the Lambda already owns.
        """
        result = []
        prefix_len = len(mount.urlPath.rstrip("/")) + 1
        for r in self.routes:
            if not r.shadows(mount):
                continue
            if not r.path_format.endswith("/") or r.path_format == "/":
                continue
            if r.parametrized:
                result.append(ShadowRoute(body=r.shadow_body + "/", methods=None))
                continue
            rel = r.path_format[prefix_len:].rstrip("/")
            if not rel:
                continue
            if os.path.isfile(os.path.join(mount.directory, *rel.split("/"))):
                result.append(ShadowRoute(body=r.shadow_body + "/", methods=None))
        return result

    def non_cdn_method_shadows(self, mount: StaticMount) -> list[ShadowRoute]:
        """Method-scoped shadows for prior routes with no GET/HEAD methods.

        Such a route's colliding file stays on the CDN (see `excluded_files`),
        but the CDN matches an existing file for any method and terminates
        with 405 rather than falling through to the Lambda. Shadowing the
        route's declared methods sends them to the app, which serves the
        route. GET/HEAD stays on the CDN.
        """
        return [
            ShadowRoute(body=r.shadow_body, methods=tuple(sorted(r.methods)))
            for r in self.routes
            if r.shadows(mount)
            and r.methods is not None
            and not (r.methods & {"GET", "HEAD"})
        ]

    def owned_dir_url_paths(self, mount: StaticMount) -> tuple[set[str], set[str]]:
        """Directory URL paths in `mount` that prior GET/HEAD routes own.

        For html=True mounts the CDN emits bare-dir 307 redirects for every
        directory that has an index.html and serves the index at the slash
        form. A prior route that owns the bare directory URL must be shadowed
        so the Lambda handles the request before the redirect fires. A route
        declared with a trailing slash owns the slash form instead (the app
        307s the bare form to it), so that form must reach the Lambda before
        the CDN serves the index.

        Returns (bare_owned, slash_owned) directory URL paths.
        """
        relevant = [
            r for r in self.routes
            if r.shadows(mount)
            and (r.methods is None or r.methods & {"GET", "HEAD"})
        ]
        if not relevant:
            return set(), set()

        bare_literal: set[str] = set()
        slash_literal: set[str] = set()
        bare_bodies: list[str] = []
        slash_bodies: list[str] = []
        for r in relevant:
            slash_form = r.path_format.endswith("/") and r.path_format != "/"
            if r.parametrized:
                (slash_bodies if slash_form else bare_bodies).append(r.shadow_body)
            else:
                (slash_literal if slash_form else bare_literal).add(
                    r.path_format.rstrip("/") or "/"
                )

        def _combined(bodies: list[str]) -> re.Pattern[str] | None:
            return re.compile("^(?:" + "|".join(bodies) + ")$") if bodies else None

        bare_combined = _combined(bare_bodies)
        slash_combined = _combined(slash_bodies)

        mount_prefix = mount.urlPath.strip("/")
        bare_owned: set[str] = set()
        slash_owned: set[str] = set()

        for dirpath, _, filenames in os.walk(mount.directory):
            if "index.html" not in filenames:
                continue
            rel = os.path.relpath(dirpath, mount.directory)
            dir_url = (
                mount.urlPath.rstrip("/") or "/"
                if rel == "."
                else mount.urlPath.rstrip("/") + "/" + rel.replace(os.sep, "/")
            )
            url_body = (mount_prefix + "/" + rel.replace(os.sep, "/")).lstrip("/") if rel != "." else mount_prefix
            if dir_url in bare_literal or (bare_combined and bare_combined.match(url_body)):
                bare_owned.add(dir_url)
            if dir_url in slash_literal or (slash_combined and slash_combined.match(url_body)):
                slash_owned.add(dir_url)

        return bare_owned, slash_owned

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
) -> tuple[list[StaticMount], list[ShadowRoute], list[str]]:
    """Discover one app.mount(): a StaticFiles mount serves from the CDN, a
    Router/sub-app recurses, and a raw ASGI app owns its subtree opaquely.
    """
    url_prefix = prefix + route.path
    if prior.eclipses(url_prefix):
        return [], [], []

    if suppress_middleware_mounts:
        has_middleware = has_middleware or bool(getattr(route.app, "user_middleware", []))

    mounts: list[StaticMount] = []
    shadow_routes: list[ShadowRoute] = []
    excluded_files: set[str] = set()

    static = StaticMount.from_route(route, prefix, frontend=False)
    if static and not has_middleware:
        mounts.append(static)
        excluded_files |= prior.excluded_files(static)
        shadow_routes += prior.non_cdn_method_shadows(static)
        shadow_routes += prior.trailing_slash_shadows(static)
        shadow_routes += _divergent_url_shadows(static)
        if route.app.html:
            bare_owned, slash_owned = prior.owned_dir_url_paths(static)
            for dir_url in bare_owned:
                shadow_routes.append(
                    ShadowRoute(body=_escape_path(dir_url) + "(?!/)", methods=None)
                )
            for dir_url in slash_owned:
                # The trailing slash pins the builder's `^/((<body>)/?)$` wrap
                # to the slash form only; the bare form stays on the CDN 307.
                shadow_routes.append(
                    ShadowRoute(body=_escape_path(dir_url) + "/", methods=None)
                )

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
        sub_mounts, sub_shadow, sub_excluded = collect(
            sub_router,
            sub_prefix,
            prior,
            has_middleware=has_middleware,
            suppress_middleware_mounts=suppress_middleware_mounts,
        )
        mounts.extend(sub_mounts)
        shadow_routes += sub_shadow
        excluded_files.update(sub_excluded)
        shadow_routes.append(_subtree_shadow_route(sub_prefix, sub_mounts))
    elif static is None:
        # A raw ASGI app (e.g. WSGIMiddleware) owns its subtree with nothing on
        # the CDN. Shadow it so a lower-priority source's leaked copy there
        # routes to the Lambda.
        shadow_routes.append(_subtree_shadow_route(url_prefix, []))

    prior.add_mount(url_prefix)
    return mounts, shadow_routes, sorted(excluded_files)


def collect(
    router: Router,
    prefix: str = "",
    prior: Precedence | None = None,
    *,
    has_middleware: bool,
    suppress_middleware_mounts: bool,
) -> tuple[list[StaticMount], list[ShadowRoute], list[str]]:
    """Walk the route table for (static mounts to copy, shadow routes, excluded files).

    Shadow routes are merged so that the same path covered by multiple API
    routes with different methods produces one entry with the union of methods.

    Excluded files are CDN URL paths withheld from copying so the Lambda
    catch-all serves them directly. Covers plain StaticFiles app-route-wins
    only.
    """
    prior = prior.child() if prior else Precedence()

    mounts: list[StaticMount] = []
    shadow_routes: list[ShadowRoute] = []
    excluded_files: set[str] = set()
    frontends: list[StaticMount] = []

    def _route_methods(route: Route) -> frozenset[str] | None:
        """HTTP methods for a Starlette Route, or None for no restriction."""
        m = getattr(route, "methods", None)
        return frozenset(m) if m else None

    def collect_mount(mount_route: Mount) -> None:
        sub_mounts, sub_shadow, sub_excluded = _collect_mount(
            mount_route, prefix, prior,
            has_middleware=has_middleware,
            suppress_middleware_mounts=suppress_middleware_mounts,
        )
        mounts.extend(sub_mounts)
        shadow_routes.extend(sub_shadow)
        excluded_files.update(sub_excluded)

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
                shadow_prefix = prefix + ctx.frontend_prefix
                sub_mounts = [s for s in mounts if s.urlPath.startswith(shadow_prefix.rstrip("/") + "/")]
                shadow_routes.append(_subtree_shadow_route(shadow_prefix, sub_mounts))
                continue
            for r in ctx.original_route.routes:
                if m := StaticMount.from_route(
                    r, prefix + ctx.frontend_prefix, frontend=True
                ):
                    frontends.append(m)

    # app.frontend() builds. Prepend so own frontends sort before included ones,
    # matching _iter_low_priority_routes. Own wins any same-prefix tie.
    own_frontends: list[StaticMount] = []
    for group in _frontend_groups(router):
        if suppress_middleware_mounts and (_frontend_has_dependencies(group) or has_middleware):
            for route in group.routes:
                if m := StaticMount.from_route(route, prefix, frontend=True):
                    shadow_prefix = m.urlPath.rstrip("/")
                    sub_mounts = [s for s in mounts if s.urlPath.startswith(shadow_prefix.rstrip("/") + "/")]
                    shadow_routes.append(_subtree_shadow_route(shadow_prefix, sub_mounts))
                    break
            continue
        for route in group.routes:
            if m := StaticMount.from_route(route, prefix, frontend=True):
                own_frontends.append(m)
    frontends = own_frontends + frontends

    # A frontend is low-priority: every route shadows it, and one whose prefix
    # an earlier mount owns is unreachable (Starlette dispatches to the mount
    # and never consults the build), so it is dropped entirely — mount,
    # fallback, and shadows.
    for m in frontends:
        if prior.eclipses(m.urlPath):
            continue
        mounts.append(m)
        shadow_routes += prior.shadow_bodies(m)

    return mounts, _merge_shadow_routes(shadow_routes), sorted(excluded_files)


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
    excludedFiles: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, object]:
        return {
            "mounts": [asdict(m) for m in self.mounts],
            "shadowRoutes": [sr.to_dict() for sr in self.shadowRoutes],
            "excludedFiles": list(self.excludedFiles),
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

    mounts, shadow_routes, excluded_files = collect(
        router, has_middleware=False, suppress_middleware_mounts=suppress_middleware_mounts
    )
    return Output(mounts=mounts, shadowRoutes=shadow_routes, excludedFiles=excluded_files)


def main() -> None:
    variable_name, output_path, project_root, module_name = sys.argv[1:5]
    suppress_middleware_mounts = sys.argv[5] != "0"
    write_output(output_path, discover(variable_name, project_root, module_name, suppress_middleware_mounts))


if __name__ == "__main__":
    main()
