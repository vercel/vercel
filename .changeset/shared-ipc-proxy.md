---
'@vercel/go': minor
---

Refactor: extract the standalone-server IPC proxy into a shared `@vercel-internals/ipc-proxy` package. 

The proxy is now compiled once into prebuilt static binaries (shipped per-architecture) and reused by compiled runtimes, instead of being compiled at deploy time. No change to deployed behavior.
