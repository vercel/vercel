---
'vercel': patch
---

Fix dev server framework auto-detection to only detect runtime frameworks (Rust, Python, Go, etc.) instead of all frameworks, preventing incorrect devCommand overrides for projects with explicit builds.
