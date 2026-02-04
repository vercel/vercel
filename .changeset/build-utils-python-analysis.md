---
'@vercel/build-utils': patch
---

Replace Python-based AST parser with WASM-based `@vercel/python-analysis` for detecting Python entrypoints. This eliminates the need for a Python runtime when analyzing Python files for WSGI/ASGI application patterns.
