# Development Guidelines

## Common

- Dependencies: PEP 440 compatible release clauses (`rich ~= 14.0`), avoid
  pinning patch releases (`rich ~= 14.0.0`).
- Only add code that is actually used. No speculative APIs or exports.
- `_internal/` is private — no backwards compatibility needed when refactoring.

## Python Tooling

- **`uv`**: `uv sync`, `uv run <cmd>`, `uv add <pkg>`
- **`ruff`**: `uv run ruff check .` (lint), `uv run ruff format .` (format)
- **`pytest`**: `uv run pytest`, `uv run pytest tests/test_foo.py`,
  `uv run pytest -k test_name`. Tests in `tests/`.
- **Type checking**: Both `uv run mypy` and `uv run basedpyright` must pass.
  Use `# pyright: ignore[...]` (not `type: ignore`) with explicit codes.

## Code Style

- Python 3.12+, `from __future__ import annotations`, forward ref style.
- `type` statement for aliases, `X | Y` unions, builtin generics
  (`list[str]`), `Self` from `typing`.
- Fully typed: all params/returns annotated, explicit `None` returns,
  avoid `Any`, prefer `cast()` over `# type: ignore`.
- PEP 8 naming (ruff-enforced).
- Import modules not names: `from foo import bar` then `bar.func()`.
  Exception: `typing` imports and common types (`datetime`, `Path`).
- Top-level imports only. Refactor cycles instead of local imports.
- No `# noqa` — fix the underlying issue.

## Git Commits

- Do not commit unless asked explicitly.
- Omit trivial changes from commit message unless they're the entire commit.
