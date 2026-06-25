---
'@vercel/python': minor
'@vercel/python-workers': patch
---

Add support for deploying multiple named Python Workflow entrypoints from `pyproject.toml` through one queue-triggered job Lambda, and prioritize the workflow subscription multiplexer at runtime.
