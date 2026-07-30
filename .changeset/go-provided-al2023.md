---
'@vercel/go': patch
---

Go functions now always target the `provided.al2023` Lambda runtime. Previously the runtime was detected from the build host's `/etc/os-release`, so running `vercel build` on an Amazon Linux 2 machine emitted `provided.al2` and the resulting prebuilt deployment failed at deploy time.
