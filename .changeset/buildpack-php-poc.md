---
'@vercel/container': minor
'@vercel/fs-detectors': patch
---

Add buildpack-based container builds for PHP projects (POC, feature-flagged).

When `VERCEL_BUILDPACKS=1` is set and a container service has no Dockerfile but
has PHP source markers (`server.php`, `index.php`, or `composer.json`), the
container builder uses Paketo's lifecycle/creator to build an OCI image via
buildpacks — no Dockerfile required.

This is gated behind `VERCEL_BUILDPACKS=1` and only affects `vercel dev` for now.
Cloud deployments still require a Dockerfile. To use:

1. Set `VERCEL_BUILDPACKS=1` in your environment
2. Add `"services": { "api": { "root": ".", "runtime": "container" } }` to vercel.json
3. Ensure your project has `server.php`, `index.php`, or `composer.json`
4. Run `vercel dev` — Docker is required (the builder image pulls via Docker)
