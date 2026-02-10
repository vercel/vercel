---
'@vercel/python': patch
'@vercel/fs-detectors': patch
'vercel': patch
---

Fixed Python service entrypoint detection for services in subdirectories.

When a Python backend framework (FastAPI, Flask, etc.) was used as a service in a subdirectory (e.g. `backend/`), the build would generate a handler referencing the pseudo entrypoint `backend/index.py` instead of the real entrypoint (e.g. `backend/main.py`), causing a `FileNotFoundError` at runtime.

Three issues were fixed:
- The CLI build no longer overrides the per-service framework with the project-level `'services'` framework, allowing the Python builder's entrypoint detection to trigger correctly.
- The service resolver now passes `serviceWorkspace` through the builder config so builders know the workspace boundary without inferring it.
- The Python entrypoint detection uses the explicit workspace to scope its search correctly, then falls back to the project root.
