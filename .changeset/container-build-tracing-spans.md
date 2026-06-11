---
'@vercel/container': patch
---

Added tracing spans throughout the container build flow (image resolution, repository creation, docker build, registry login, push, and image readiness) under the builder span provided by the CLI. Spans carry non-secret diagnostics (registry, repository, image ref/digest, token source, docker daemon version, readiness mode/attempts) and are always closed on failure, making the build-container flow observable end to end.
