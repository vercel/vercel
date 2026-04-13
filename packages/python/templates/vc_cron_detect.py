"""
Dynamically detect cron entries by calling a user-provided function.

Usage: python -c <script> <module> <callable>

The callable must return an iterable of (module_function, schedule) pairs,
where module_function uses "module:function" format and schedule is a
5-field cron expression.

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
        _error(f"Expected 2 arguments (module, callable), got {len(sys.argv) - 1}")

    module_name = sys.argv[1]
    callable_name = sys.argv[2]

    try:
        mod = importlib.import_module(module_name)
    except ImportError as exc:
        _error(f"Failed to import module '{module_name}': {exc}")

    fn = getattr(mod, callable_name, None)
    if fn is None:
        _error(f"Module '{module_name}' has no attribute '{callable_name}'")

    if not callable(fn):
        _error(f"'{module_name}.{callable_name}' is not callable")

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
        _error(f"Error calling '{module_name}.{callable_name}()': {exc}")


main()
