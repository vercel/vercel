---
'vercel': patch
---

Prefix each build-output line with a service tag during multi-service builds. Because each service now builds in its own forked worker with piped stdout/stderr, the CLI reads and tags every line the build produces — including output from subprocesses the builder spawns (e.g. `next build`) — with `[vc:service:<name>]`. The Vercel build-container strips this tag and uses it to attribute each build log line to a service. Single-project builds are unaffected.
