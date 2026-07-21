"""
Detect the queue namespace for a configured workflow registry.

Usage:
  python -c <script> <module> <attribute>
  python -c <script> --source <file> <attribute>

Prints JSON to stdout:
  {"namespace": "billing"}
  {"namespace": null}
On error:
  {"error": "description"}
"""

import ast
import contextlib
import importlib
import json
from pathlib import Path
import sys
from typing import NoReturn


def _error(msg: str) -> NoReturn:
    print(json.dumps({"error": msg}))
    sys.exit(1)


def _print_namespace(namespace):
    if namespace is not None and not isinstance(namespace, str):
        _error("Workflow namespace must be a string or None")
    print(json.dumps({"namespace": namespace}))


def _detect_from_module(module_name: str, attr_name: str):
    try:
        from vercel.workflow import Workflows
    except ImportError as exc:
        _error(f"Failed to import 'vercel.workflow': {exc}")

    try:
        # Keep application logging from corrupting the structured stdout result.
        with contextlib.redirect_stdout(sys.stderr):
            mod = importlib.import_module(module_name)
    except Exception as exc:
        _error(f"Failed to import module '{module_name}': {exc}")

    obj = getattr(mod, attr_name, None)
    if obj is None:
        _error(f"Module '{module_name}' has no attribute '{attr_name}'")
    if not isinstance(obj, Workflows):
        _error(
            f"'{module_name}.{attr_name}' is not a vercel.workflow.Workflows instance"
        )

    # Older SDK releases predate queue namespaces. Treat those registries as
    # unnamespaced so existing workflow deployments remain compatible.
    namespace = getattr(obj, "namespace", None)
    _print_namespace(namespace)


def _assignment_target_name(node):
    if isinstance(node, ast.Assign):
        for target in node.targets:
            if isinstance(target, ast.Name):
                return target.id
    elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
        return node.target.id
    return None


def _assignment_value(node):
    if isinstance(node, (ast.Assign, ast.AnnAssign)):
        return node.value
    return None


def _detect_from_source(file_path: str, attr_name: str):
    try:
        source = Path(file_path).read_text(encoding="utf-8")
        tree = ast.parse(source, filename=file_path)
    except Exception as exc:
        _error(f"Failed to parse workflow entrypoint '{file_path}': {exc}")

    assignments = {
        name: _assignment_value(node)
        for node in tree.body
        if (name := _assignment_target_name(node)) is not None
    }
    value = assignments.get(attr_name)
    if not isinstance(value, ast.Call):
        # Preserve existing local-dev behavior for registries imported from
        # another module or created by a factory. Build-time import detection
        # remains authoritative for deployed queue triggers.
        _print_namespace(None)
        return

    namespace_node = next(
        (keyword.value for keyword in value.keywords if keyword.arg == "namespace"),
        None,
    )
    if namespace_node is None:
        _print_namespace(None)
        return

    if isinstance(namespace_node, ast.Name):
        namespace_node = assignments.get(namespace_node.id)
    if not (
        isinstance(namespace_node, ast.Constant)
        and isinstance(namespace_node.value, str)
    ):
        _error(
            f"Workflow namespace for '{attr_name}' in '{file_path}' must be a "
            "string literal or top-level string constant for local development"
        )

    _print_namespace(namespace_node.value)


def main():
    if len(sys.argv) == 4 and sys.argv[1] == "--source":
        _detect_from_source(sys.argv[2], sys.argv[3])
        return
    if len(sys.argv) == 3:
        _detect_from_module(sys.argv[1], sys.argv[2])
        return
    _error(f"Expected 2 arguments or --source plus 2 arguments, got {len(sys.argv) - 1}")


main()
