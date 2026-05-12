---
'@vercel/python': minor
---

Support `vc build` + `vc deploy --prebuilt` for Python functions. When building outside the Vercel build image, `uv sync` now targets `x86_64-unknown-linux-gnu` so Linux-compatible wheels are resolved. Downloads the Linux `uv` binary (with SHA-256 verification) for runtime dependency installation, and uses the Lambda target platform for PEP 508 marker evaluation and Prisma engine binary selection.
