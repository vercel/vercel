---
'@vercel/go': patch
---

Fix standalone Go server builds failing when user sets Go-version-specific env vars (e.g. GOEXPERIMENT). The bootstrap wrapper now builds with a clean environment, excluding user-provided env vars that may be incompatible with the Go version used for the wrapper. Also moves bootstrap source files to a `bootstrap/` subdirectory and bumps the bootstrap Go version from 1.21 to 1.23.
