---
'vercel': minor
---

Improved startup time 1.2-1.5x for CLI commands by implementing a different bundling & lazy loading strategy

Specifically, speedup the following subcommands: deploy, env, list, link, build, dev (informed by telemetry end-user usage data). The rest of the commands also became faster due to reduced amount of code they need to load.
