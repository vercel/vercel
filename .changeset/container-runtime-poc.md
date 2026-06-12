---
'@vercel/build-utils': patch
'@vercel/fs-detectors': patch
'@vercel/container': patch
'vercel': patch
---

Add an experimental container service runtime that builds a service's Dockerfile and pushes the resulting OCI image to the Vercel Container Registry (VCR), or passes a prebuilt image reference through as build output.

- `@vercel/container`: New builder that authenticates to VCR with the project's OIDC token, builds and pushes the image, and waits for it to become ready. The build flow is instrumented with tracing spans (image resolution, repository creation, docker build, registry login, push, readiness) carrying non-secret diagnostics, with opt-in debug logging via `VERCEL_CONTAINER_DEBUG=1`.
- `vercel`: Ensure a fresh OIDC token reaches the builder during `vercel build` — the refresh path now uses the correct linked project id and never passes a known-expired token to builders.
