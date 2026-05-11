---
---

Pin `@tanstack/*` deps in `examples/tanstack-start` to the safe `1.133.x` versions that are already in the lockfile. The previous caret ranges (`^1.131.7`/`^1.132.0`) would resolve to the malicious `1.16x.x` versions published in the 2026-05-11 TanStack supply-chain compromise (Mini Shai-Hulud) if the lockfile is regenerated. See https://socket.dev/blog/tanstack-npm-packages-compromised-mini-shai-hulud-supply-chain-attack and https://github.com/TanStack/router/issues/7383.
