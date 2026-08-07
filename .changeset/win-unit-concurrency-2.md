---
---

Move the `Unit / win/node22` job to the org's shared `windows-latest-8-core` larger runner (previously `windows-latest`, 4 cores / 16 GB). Turborepo concurrency stays at 1, but vitest now gets 8 cores and 32 GB per package. When cache-busting changes (workflow files, lockfile, turbo.json) force a full re-run of all unit-test tasks, the serial Windows job exceeded its 65-minute step timeout while Linux and macOS finished in ~13 minutes.
