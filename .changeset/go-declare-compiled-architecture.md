---
'@vercel/go': patch
---

Declare the architecture a Go function was compiled for, so a build on an arm64 host no longer deploys an amd64 binary as an arm64 function.
