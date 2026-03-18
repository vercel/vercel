---
'@vercel/fs-detectors': patch
---

Improve services auto-detection so a single detected frontend at the project root,
`frontend/`, or `apps/<name>/` is mounted at `/` even without backend services.
