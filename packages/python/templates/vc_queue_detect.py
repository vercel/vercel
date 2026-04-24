"""
Dynamically detect queue subscriptions registered via the Vercel queue SDK.

Usage: python -c <script> <module> [attribute]

For file-style entrypoints, the module is imported and the SDK registry is read.
For module:attribute entrypoints, the attribute is asked for
get_vercel_queue_subscriptions() directly if it exposes that method.

Prints JSON to stdout:
  {"subscriptions": [{"topic": "users.create", "handler": "worker:handle"}]}
On error:
  {"error": "description"}
"""

import importlib
import json
import sys
from typing import NoReturn

# The public-facing SDK will move to vercel.queue
# For now it exists in vercel.workers
SDK_MODULES = ("vercel.workers",)
HOOK_NAME = "get_vercel_queue_subscriptions"


def _error(msg: str) -> NoReturn:
    print(json.dumps({"error": msg}))
    sys.exit(1)


def _validate_subscriptions(subscriptions, source):
    if not isinstance(subscriptions, list):
        _error(f"{source}.{HOOK_NAME}() must return a list, got: {type(subscriptions).__name__}")

    entries = []
    for item in subscriptions:
        if not isinstance(item, dict):
            _error(f"Each subscription must be a dict, got: {item!r}")
        topic = item.get("topic")
        handler = item.get("handler")
        if not isinstance(topic, str) or not isinstance(handler, str):
            _error(f"Each subscription must include string topic and handler, got: {item!r}")
        entries.append({"topic": topic, "handler": handler})
    return entries


def _detect_from_object(mod, module_name, attr_name):
    obj = getattr(mod, attr_name, None)
    if obj is None:
        _error(f"Module '{module_name}' has no attribute '{attr_name}'")

    get_subscriptions = getattr(obj, HOOK_NAME, None)
    if get_subscriptions is None:
        return []
    if not callable(get_subscriptions):
        _error(f"'{module_name}.{attr_name}.{HOOK_NAME}' is not callable")

    try:
        subscriptions = get_subscriptions()
    except Exception as exc:
        _error(f"Error calling {module_name}.{attr_name}.{HOOK_NAME}(): {exc}")

    return _validate_subscriptions(subscriptions, f"{module_name}.{attr_name}")


def _detect_from_registries():
    entries = []
    found_registry = False
    seen = set()

    for sdk_module in SDK_MODULES:
        try:
            sdk = importlib.import_module(sdk_module)
        except ImportError:
            continue

        get_subscriptions = getattr(sdk, HOOK_NAME, None)
        if get_subscriptions is None or not callable(get_subscriptions):
            continue

        found_registry = True
        try:
            subscriptions = get_subscriptions()
        except Exception as exc:
            _error(f"Error calling {sdk_module}.{HOOK_NAME}(): {exc}")

        for item in _validate_subscriptions(subscriptions, sdk_module):
            key = (item["topic"], item["handler"])
            if key not in seen:
                seen.add(key)
                entries.append(item)

    if not found_registry:
        _error(f"No Vercel queue SDK exposes callable {HOOK_NAME}()")

    return entries


def main() -> None:
    if len(sys.argv) not in (2, 3):
        _error(f"Expected 1 or 2 arguments (module[, attribute]), got {len(sys.argv) - 1}")

    module_name = sys.argv[1]
    attr_name = sys.argv[2] if len(sys.argv) == 3 else None

    try:
        mod = importlib.import_module(module_name)
    except ImportError as exc:
        _error(f"Failed to import module '{module_name}': {exc}")

    entries = (
        _detect_from_object(mod, module_name, attr_name)
        if attr_name is not None
        else _detect_from_registries()
    )

    print(json.dumps({"subscriptions": entries}))


main()
