from __future__ import annotations

import inspect
import sys
from importlib import util as _importlib_util
from typing import TYPE_CHECKING, Any, Literal, cast

if TYPE_CHECKING:
    from types import ModuleType
    from wsgiref.types import WSGIApplication

    from vercel_runtime.asgi import ASGI


# Import relative path
# https://docs.python.org/3/library/importlib.html#importing-a-source-file-directly
def import_module(name: str, path: str) -> ModuleType:
    spec = _importlib_util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        msg = f'could not load module spec for "{name}" at {path}'
        raise RuntimeError(msg)
    mod = _importlib_util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def resolve_app(
    mod: ModuleType, module_name: str, var: str
) -> tuple[str, Any]:
    if hasattr(mod, var):
        return var, getattr(mod, var)

    raise RuntimeError(
        f'missing variable "{var}" in file "{module_name}".\n'
        "See the docs: https://vercel.com/docs/functions/serverless-functions/runtimes/python"
    )


def _get_positional_param_count(obj: object) -> int | None:
    try:
        sig = inspect.signature(obj)  # type: ignore[arg-type]
        return sum(
            1
            for p in sig.parameters.values()
            if p.default is inspect.Parameter.empty
            and p.kind
            in (
                inspect.Parameter.POSITIONAL_ONLY,
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
            )
        )
    except (ValueError, TypeError):
        return None


def detect_app_type(
    app_obj: object,
    module_name: str,
    app_name: str,
) -> tuple[Literal["asgi"], ASGI] | tuple[Literal["wsgi"], WSGIApplication]:
    # Try .asgi attribute if it's available and is callable
    asgi_attr = getattr(app_obj, "asgi", None)
    if asgi_attr is not None and callable(asgi_attr):
        return "asgi", cast("ASGI", asgi_attr)

    # For async detection, check the object itself first
    # (works for plain functions/methods).
    # For class instances iscoroutinefunction(obj) is False,
    # so fall back to __call__.
    is_async = inspect.iscoroutinefunction(app_obj)
    if not is_async and callable(app_obj):
        is_async = inspect.iscoroutinefunction(
            app_obj.__call__  # pyright: ignore[reportFunctionMemberAccess]
        )

    param_count = _get_positional_param_count(app_obj)

    # that's ASGI (scope, receive, send)
    if is_async and param_count == 3:
        return "asgi", cast("ASGI", app_obj)

    # that's WSGI (environ, start_response)
    if param_count == 2:
        return "wsgi", cast("WSGIApplication", app_obj)

    raise RuntimeError(
        f"Could not determine the application interface for "
        f"'{module_name}:{app_name}'\n"
        f"Expected either:\n"
        f"  - an ASGI app: async callable(scope, receive, send)\n"
        f"  - a WSGI app: callable(environ, start_response)"
    )
