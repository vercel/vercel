"""
Discover StaticFiles mounts in a FastAPI/Starlette app by importing the user's
app object and walking its route table. Prints a JSON array of
{"urlPath": str, "directory": str} objects to stdout.

Usage: python -c <this_script> <entrypoint_abs_path> <variable_name>
"""

import importlib.util
import json
import os
import sys


def main() -> None:
    entrypoint_abs = sys.argv[1]
    variable_name = sys.argv[2]

    spec = importlib.util.spec_from_file_location("__vc_app", entrypoint_abs)
    if spec is None or spec.loader is None:
        print(json.dumps([]))
        return

    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)  # type: ignore[union-attr]
    except Exception as exc:
        print(f"vc_fastapi_static: exec_module failed: {exc}", file=sys.stderr)
        print(json.dumps([]))
        return

    app = getattr(mod, variable_name, None)
    if app is None:
        print(json.dumps([]))
        return

    try:
        from starlette.routing import Mount
        from starlette.staticfiles import StaticFiles
    except ImportError:
        print(json.dumps([]))
        return

    mounts = []
    for route in getattr(app, "routes", []):
        if isinstance(route, Mount) and isinstance(route.app, StaticFiles):
            directory = route.app.directory
            mounts.append(
                {
                    "urlPath": route.path,
                    "directory": os.path.abspath(str(directory)),
                }
            )

    print(json.dumps(mounts))


main()
