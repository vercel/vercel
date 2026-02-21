from __future__ import annotations

import ast
import runpy


def _is_main_guard_test(node: ast.AST) -> bool:
    if not isinstance(node, ast.Compare):
        return False
    if len(node.ops) != 1 or not isinstance(node.ops[0], ast.Eq):
        return False
    if len(node.comparators) != 1:
        return False

    left = node.left
    right = node.comparators[0]

    left_is_name = isinstance(left, ast.Name) and left.id == "__name__"
    right_is_main = (
        isinstance(right, ast.Constant)
        and isinstance(right.value, str)
        and right.value == "__main__"
    )
    if left_is_name and right_is_main:
        return True

    right_is_name = isinstance(right, ast.Name) and right.id == "__name__"
    left_is_main = (
        isinstance(left, ast.Constant)
        and isinstance(left.value, str)
        and left.value == "__main__"
    )
    return right_is_name and left_is_main


def has_main_guard(entrypoint_abs: str | None) -> bool:
    if not entrypoint_abs:
        return False

    try:
        with open(entrypoint_abs, encoding="utf-8") as file:
            source = file.read()
    except Exception:
        return False

    try:
        tree = ast.parse(source, filename=entrypoint_abs)
    except Exception:
        return False

    for node in ast.walk(tree):
        if isinstance(node, ast.If) and _is_main_guard_test(node.test):
            return True
    return False


def run_entrypoint_as_main(entrypoint_abs: str) -> None:
    runpy.run_path(entrypoint_abs, run_name="__main__")
