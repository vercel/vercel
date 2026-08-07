---
---

Clean up leaked temp workPath directories in the shared `runBuildLambda` test harness. Each call created a `/tmp/vercel-*` directory containing a full fixture build (node_modules + build output) and never deleted it, which exhausted disk space on GitHub-hosted runners during long e2e chunks (ENOSPC in `@vercel/next` e2e jobs). Test-scoped dirs are now removed in `afterEach` and hook-scoped dirs in `afterAll`.
