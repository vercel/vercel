---
'@vercel/container': patch
'@vercel/build-utils': patch
'@vercel/fs-detectors': patch
'vercel': patch
---

Add an experimental container service runtime. A service with
`runtime: "container"` either builds its `Dockerfile`/`Containerfile` and pushes
the resulting OCI image to the Vercel Container Registry (VCR), or passes a
prebuilt image reference through as build output.

- **`@vercel/container`** (new builder): authenticates to VCR with the project's
  `VERCEL_OIDC_TOKEN`, ensures the repository exists, builds and pushes the
  image, and emits a digest-pinned reference in `handler` (container functions
  are `type: "Lambda"` with `runtime: "container"`; the platform surfaces
  `handler` as the image downstream). Uses `docker` on developer machines and
  `buildah` (daemonless) in the Vercel build container behind a shared
  `ContainerEngine` interface. Supports `vc dev` via `startDevServer` (local
  build/run, env parity, log forwarding) and `prepareCache` for buildah layer
  reuse between builds. Build flow is instrumented with tracing spans
  (non-secret diagnostics) and debug logging gated on `BUILDER_DEBUG`.
- **`@vercel/build-utils`**: add the `ContainerImage` build-output type.
- **`@vercel/fs-detectors`**: resolve container services from `vercel.json`
  (the `services` config and its deprecated `experimentalServices` /
  `experimentalServicesV2` aliases). A `Dockerfile`, `Containerfile`, or
  `*.dockerfile` entrypoint triggers a build; any other entrypoint is treated as
  a prebuilt OCI image reference.
- **`vercel`**: wire container output into `vercel build` result writing and
  config validation.

Buildah specifics in the build container: host networking for `RUN` steps,
native `overlay` storage on the XFS `/vercel` volume (deferring to the image's
`storage.conf`), zstd push compression, and registry credentials read from the
provisioned auth file when present. Several knobs are available for debugging:
`VERCEL_CONTAINER_ENGINE`, `VERCEL_VCR_STRICT_STORAGE`,
`VERCEL_VCR_DISABLE_LAYER_CACHE`, and `VERCEL_VCR_FORCE_LOGIN`.
