---
'vercel': minor
---

Describe a service's connection methods in `vercel connect create <service> --help`.

Help for a specific service now lists the products it exposes, each connection method with the credentials and template params it needs, and a runnable example per method. The generic flag reference stays on `vercel connect create --help`, which the service-specific output points to.

Falls back to static help when the service is unknown or the API is unreachable, so `--help` never depends on a working connection.
