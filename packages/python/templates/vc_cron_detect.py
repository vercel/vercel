"""
Dynamically detect cron entries by calling get_crons() on a named object.

Usage: python -c <script> <module> <attribute>

The attribute must be an object with a get_crons() method that returns an
iterable of (module_function, schedule) pairs, where module_function uses
"module:function" format and schedule is a 5-field cron expression.

Prints JSON to stdout:
  {"entries": [{"module_function": "jobs.cleanup:handler", "schedule": "0 0 * * *"}]}
On error:
  {"error": "description"}
"""

import importlib
import json
import sys
from typing import NoReturn


def _error(msg: str) -> NoReturn:
    print(json.dumps({"error": msg}))
    sys.exit(1)


def main():
    if len(sys.argv) != 3:
        _error(f"Expected 2 arguments (module, attribute), got {len(sys.argv) - 1}")

    module_name = sys.argv[1]
    attr_name = sys.argv[2]

    try:
        mod = importlib.import_module(module_name)
    except ImportError as exc:
        _error(f"Failed to import module '{module_name}': {exc}")

    obj = getattr(mod, attr_name, None)
    if obj is None:
        _error(f"Module '{module_name}' has no attribute '{attr_name}'")

    fn = getattr(obj, "get_crons", None)
    if fn is None:
        _error(
            f"'{module_name}.{attr_name}' has no 'get_crons' method. "
            f"The cron entrypoint object must define a get_crons() method that "
            f"returns a list of (module:function, schedule) pairs."
        )

    if not callable(fn):
        _error(f"'{module_name}.{attr_name}.get_crons' is not callable")

    try:
        result = fn()
        entries = []
        for item in result:
            if not (isinstance(item, (list, tuple)) and len(item) == 2):
                _error(f"Each cron entry must be a (module:function, schedule) pair, got: {item!r}")
            module_function, schedule = item
            entries.append({"module_function": str(module_function), "schedule": str(schedule)})
        print(json.dumps({"entries": entries}))
    except Exception as exc:
        _error(f"Error calling '{module_name}.{attr_name}.get_crons()': {exc}")


main()
