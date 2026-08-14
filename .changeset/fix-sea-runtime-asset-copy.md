---
'vercel': patch
---

Fixed `vc dev` failing with `ENOENT ... copyfile '/snapshot/...'` in the native binary when the devCommand triggers the Next.js dev WebSocket shim. The shim is now extracted from the SEA virtual filesystem with a read+write instead of `copyFileSync`, which does not support copying across the VFS boundary.
