## Relative Import Repro

This fixture reproduces a Python package-root entrypoint that uses a relative import:

- `main.py` imports `from .utils import ...`
- `__init__.py` marks `workPath` as a package
- `pyproject.toml` exposes `app = "main:app"`

Deploy from this directory and hit:

- `/`
- `/api/relative/<name>`

If package context is resolved correctly, both routes return JSON with
`"import_marker":"relative-import-ok"`.
