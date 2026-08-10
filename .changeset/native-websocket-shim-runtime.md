---
'vercel': patch
---

Materialize the Next.js `vc dev` WebSocket preload shim to `~/.vercel/runtime/<version>/` so child Node processes can `--require` it (including native SEA installs whose `/snapshot` paths are not visible to external Node).
