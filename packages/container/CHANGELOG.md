# @vercel/container

## 0.0.2

### Patch Changes

- 09743c6: Support deploying any project as a container via a `Dockerfile.vercel` or `Containerfile.vercel` marker. A new experimental `container` framework preset detects these files and is listed first so it takes precedence over all other frameworks — a project that also looks like (e.g.) a Next.js app will deploy as a container when one of these markers is present. As an experimental framework it is gated behind `VERCEL_USE_EXPERIMENTAL_FRAMEWORKS`. The `@vercel/container` builder now recognizes the `.vercel` markers, auto-discovers them when its entrypoint is `<detect>`, and supports root (non-service) container deploys.
- 03fbb1c: Fix container service build output so requests reach the function. Container services now do a normal build, emitting the function at the natural `index` path inside the nested `services/<name>/` output along with a catch-all route, instead of namespacing under `_svc/<name>/index` with no route to it. Previously a request to the service root never matched the function.

## 0.0.1

### Patch Changes

- 186014d: `vc dev` no longer leaks host/shell-only environment variables into container
  services. Variables that describe the developer's machine rather than the Linux
  container — notably macOS `TMPDIR` (`/var/folders/.../T`), plus `HOME`, `PATH`,
  `SHELL`, and similar — are now filtered out of the container's env. Previously
  they were passed through and broke apps that write to the OS temp dir (e.g.
  Ghost's multer upload middleware failed with `EACCES`). The container's own
  values for these are used instead.
- 186014d: `vc dev` now publishes container services on the host port the services
  orchestrator pre-allocated (`meta.port`) instead of a Docker-chosen ephemeral
  port. Service bindings target the pre-allocated port
  (`http://127.0.0.1:<port>/`), so a container published on a different port was
  unreachable for cross-service requests. Falls back to an ephemeral port when no
  port is provided.
- 186014d: Add an experimental container service runtime. A service with
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
