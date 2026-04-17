---
"@vercel/python": patch
---

fix(python): detect system Python version in dev mode instead of hardcoding minor 0

`getDevPythonVersion()` previously returned `minor: 0`, causing `vercel dev` to
pass `--python 3.0` (via `requires-python = "~=3.0.0"`) to uv. uv >= 0.10.11
rejects Python < 3.7, breaking local development for Python serverless functions.

The fix detects the actual `python3` version at runtime and falls back to the
default production Python version when detection fails.

Fixes #16014
