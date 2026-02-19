---
'@vercel/python-analysis': minor
'@vercel/python-runtime': minor
'@vercel/python': minor
---

Optimize cold starts for lambdas >250MB

1. Remove `uv pip install` and replace it with `uv sync --inexact --frozen`
2. Pack the lambda zip with dependencies up to 245MB then only install the remaining ones at runtime
