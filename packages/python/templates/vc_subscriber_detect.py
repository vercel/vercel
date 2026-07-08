"""
Dynamically detect queue subscriptions by calling get_queue_subscriptions()
on a named object.

Usage: python -c <script> <module> <attribute>

The attribute should be an object with a get_queue_subscriptions() method
that returns an iterable of mappings, each with a "topic" string (exact name
or wildcard pattern) and optional trigger fields: max_deliveries,
retry_after_seconds, initial_delay_seconds, max_concurrency.

Prints JSON to stdout:
  {"subscriptions": [{"topic": "emails", "retry_after_seconds": 60}]}
When the object has no get_queue_subscriptions() method:
  {"unsupported": true}
On error:
  {"error": "description"}
"""

import importlib
import json
import sys
from collections.abc import Mapping
from typing import NoReturn

_TRIGGER_FIELDS = (
    "max_deliveries",
    "retry_after_seconds",
    "initial_delay_seconds",
    "max_concurrency",
)
_ALLOWED_FIELDS = frozenset(("topic",) + _TRIGGER_FIELDS)

_real_stdout = sys.stdout


def _error(msg: str) -> NoReturn:
    print(json.dumps({"error": msg}), file=_real_stdout)
    sys.exit(1)


def main():
    if len(sys.argv) != 3:
        _error(f"expected 2 arguments (module, attribute), got {len(sys.argv) - 1}")

    module_name = sys.argv[1]
    attr_name = sys.argv[2]

    # User code may print during import or detection; keep the real stdout
    # clean so the JSON result stays parseable.
    sys.stdout = sys.stderr
    try:
        try:
            mod = importlib.import_module(module_name)
        except ImportError as exc:
            _error(f'could not import module "{module_name}": {exc}')

        obj = getattr(mod, attr_name, None)
        if obj is None:
            _error(f'module "{module_name}" has no attribute "{attr_name}"')

        fn = getattr(obj, "get_queue_subscriptions", None)
        if fn is None:
            # Not an error: the caller decides whether the contract is
            # required (deriving topics) or optional (validating explicit
            # topics against code).
            print(json.dumps({"unsupported": True}), file=_real_stdout)
            return
        if not callable(fn):
            _error(f'"{module_name}.{attr_name}.get_queue_subscriptions" is not callable')

        try:
            items = list(fn())
        except Exception as exc:
            _error(
                f'error calling "{module_name}.{attr_name}.get_queue_subscriptions()": {exc}'
            )

        subscriptions = []
        seen_topics = set()
        for item in items:
            if not isinstance(item, Mapping):
                _error(f'each subscription must be a mapping with a "topic" key, got: {item!r}')
            unknown = sorted(set(item) - _ALLOWED_FIELDS)
            if unknown:
                _error(f"subscription has unrecognized field(s): {', '.join(map(repr, unknown))}")
            topic = item.get("topic")
            if not isinstance(topic, str) or not topic:
                _error(f'subscription "topic" must be a non-empty string, got: {topic!r}')
            if topic in seen_topics:
                _error(f'duplicate subscription topic "{topic}"')
            seen_topics.add(topic)

            entry = {"topic": topic}
            for field in _TRIGGER_FIELDS:
                value = item.get(field)
                if value is None:
                    continue
                if isinstance(value, bool) or not isinstance(value, (int, float)):
                    _error(f'subscription field "{field}" must be a number, got: {value!r}')
                entry[field] = value
            subscriptions.append(entry)

        print(json.dumps({"subscriptions": subscriptions}), file=_real_stdout)
    finally:
        sys.stdout = _real_stdout


main()
