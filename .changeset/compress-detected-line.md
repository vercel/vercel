---
'vercel': patch
---

Compress the `Auto-detected Project Settings for X` line into a single, denser status: `Detected X (build: vite build, output: dist)`. The build + output commands surface inline so the user can verify what the CLI is about to run without saying "yes" to Customize defaults first. Same information, half the lines.
