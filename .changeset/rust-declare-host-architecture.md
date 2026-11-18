---
'@vercel/rust': patch
---

Declare the build host's architecture for Rust functions built on Vercel, so a build on an arm64 host no longer deploys an arm64 binary as an x86_64 function.
