---
'@vercel/go': patch
---

Fix `vc dev` for standalone Go server mode: 
* matching the real Go entrypoint when the framework preset's placeholder src does not exist
* serve all request paths
* keep a persistent dev server across requests instead of respawning `go run` per request, and wait for the server port to be ready instead of a fixed 2s window
