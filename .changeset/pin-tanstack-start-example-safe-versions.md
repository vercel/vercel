---
---

Pin `@tanstack/*` deps in the tanstack-start example to the safe `1.133.x` versions already in the lockfile, so the caret ranges can't re-resolve to the malicious `1.16x.x` versions published in the 2026-05-11 TanStack supply-chain compromise.

Refs:

- https://socket.dev/blog/tanstack-npm-packages-compromised-mini-shai-hulud-supply-chain-attack
- https://github.com/TanStack/router/issues/7383
