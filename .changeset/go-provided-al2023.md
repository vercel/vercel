---
'@vercel/go': patch
---

Always build Go functions for the `provided.al2023` Lambda runtime instead of detecting it from the build host's `/etc/os-release`.
