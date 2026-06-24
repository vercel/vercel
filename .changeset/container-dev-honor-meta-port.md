---
'@vercel/container': patch
---

`vc dev` now publishes container services on the host port the services
orchestrator pre-allocated (`meta.port`) instead of a Docker-chosen ephemeral
port. Service bindings target the pre-allocated port
(`http://127.0.0.1:<port>/`), so a container published on a different port was
unreachable for cross-service requests. Falls back to an ephemeral port when no
port is provided.
