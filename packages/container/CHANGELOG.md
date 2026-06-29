# @vercel/container

## 0.0.4

### Patch Changes

- 262e935: Fixed `vercel dev` for the `container` framework when used as a top-level build (outside of `services`).

  - The dev server now maps the container preset's `<detect>` sentinel to a discovered Dockerfile (`Dockerfile.vercel`, `Containerfile.vercel`, `Dockerfile`, or `Containerfile`), so the build is recognized instead of warning that it "did not match any source files".
  - The `@vercel/container` `build()` path no longer throws `` `vercel dev` cannot build container images from a Dockerfile `` during dev. Containers are always built from a Dockerfile/Containerfile (there is no prebuilt-image input); in dev the image is built and run locally by `startDevServer`, so `build()` returns a stable local tag without pushing to a registry.
  - The dev server no longer treats a container build output (an OCI image reference, `runtime: "container"`) as a zip-based function. It previously failed with `output.createZip is not a function` while trying to spin the image up under `fun`; container outputs are now skipped there and served by the builder's `startDevServer` instead.
  - The dev path (`startDevServer`) now discovers the `Dockerfile.vercel` / `Containerfile.vercel` opt-in markers when the container entrypoint is the `<detect>` sentinel, matching the build path. Previously it only looked for a bare `Dockerfile`, so a project using a `.vercel` marker failed with "Container service must specify an entrypoint…" even though deploys worked. The discovery helper is now shared between the build and dev paths.
  - `vercel dev` now fails fast with a clear message when the Docker daemon isn't running ("Could not connect to the Docker daemon. Start Docker…") instead of a cryptic `Container "undefined" exited (code 125) before becoming ready.`. Container start failures also now name the actual container and include the underlying Docker error output.
  - The container dev server is now reused across requests. Previously the image was rebuilt and a fresh container started on every HTTP request (the result was missing the `persistent` flag); now a live container is kept and reused for the same service, matching how other persistent builders behave.

## 0.0.3

### Patch Changes

- 66be3e0: [services] Refine container detection for `services` / `experimentalServicesV2`.

  - A supplied `entrypoint` infers `runtime: "container"` when it names one of the
    blessed Dockerfile names: `Dockerfile`, `Containerfile`, `Dockerfile.vercel`,
    or `Containerfile.vercel`. A suffixed name like `Dockerfile.prod` is not a
    container entrypoint.
  - `runtime: "container"` without an `entrypoint` auto-detects one of those same
    four blessed names in the service root, probing `Dockerfile.vercel`,
    `Containerfile.vercel`, `Dockerfile`, `Containerfile` (in that order, so a
    `.vercel` opt-in marker takes precedence over a plain `Dockerfile`).
  - Removed the prebuilt OCI image reference entrypoint: an `entrypoint` must now
    name a Dockerfile/Containerfile, otherwise the service errors.
  - `@vercel/container` recognizes the same blessed set (via a shared
    `isDockerfileRef`), keeping the builder and the services resolver in sync so
    the configured Dockerfile entrypoint is honored instead of being ignored in
    favor of a default `Dockerfile` or treated as a prebuilt image reference.
  - The `container` framework preset is no longer experimental: a project with a
    `Dockerfile.vercel` / `Containerfile.vercel` marker is detected as a
    container without `VERCEL_USE_EXPERIMENTAL_FRAMEWORKS`.

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
