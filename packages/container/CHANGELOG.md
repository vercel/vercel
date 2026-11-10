# @vercel/container

## 23.0.0

### Minor Changes

- 5f55ccc: Add an experimental Buildah image store cache, enabled with `VERCEL_BUILDAH_STORE_CACHE=1`, so builds reuse images and layers from earlier deployments. Concurrent service builds share one `--source-date-epoch` per deployment so their layers stay reusable. `@vercel/build-utils` now exports `resolveBuildConcurrency()`.
- 2a5ebec: Run container schedule commands through a schedules dispatcher added to the built image.

### Patch Changes

- 41c8d95: Build schedule command images with the schedule's `root` as the build context, and have the dispatcher read the command from `VERCEL_SCHEDULE_COMMAND` in the function's environment instead of the image's CMD.
- 2a0a79a: Complete a schedule command invocation when a process that left the command's process group keeps its output open, dropping that output after 1s.
- b2a9eb5: Expand HTTP regression coverage for the standalone IPC proxy.
- Updated dependencies [5f55ccc]
- Updated dependencies [d0629bd]
  - @vercel/build-utils@15.1.0

## 22.0.2

### Patch Changes

- 2f0edaf: Report the runtime preset for services without a framework.
- Updated dependencies [2f0edaf]
  - @vercel/build-utils@15.0.2

## 22.0.1

### Patch Changes

- 1a379a3: Support `livenessProbe` in `vercel.json#daemons`.
- Updated dependencies [1a379a3]
  - @vercel/build-utils@15.0.1

## 22.0.0

### Patch Changes

- Updated dependencies [9b1b587]
- Updated dependencies [fec2df1]
- Updated dependencies [d123652]
  - @vercel/build-utils@15.0.0

## 21.0.0

### Patch Changes

- 148453b: Emit daemon service bindings in the Build Output API daemon descriptor.
- Updated dependencies [9abaa6d]
- Updated dependencies [179d4ab]
- Updated dependencies [d39dd61]
- Updated dependencies [5aa1b58]
  - @vercel/build-utils@14.23.0

## 20.0.0

### Minor Changes

- b11e94a: Build daemon images with the Go and Rust buildpacks. A buildpack daemon gets its own image repository and cache, and has `command` baked into the image. When its buildpack fails, the build names the daemon and its root.

  Buildpack builds pass the program to build as `VERCEL_ENTRYPOINT`, which replaces `VERCEL_GO_TARGET`: a service's entrypoint, else a zero-config project's `VERCEL_ENTRYPOINT` environment variable, then for Go the first of `@vercel/go`'s `main.go`, `cmd/api/main.go`, and `cmd/server/main.go`, and for a zero-config Rust project `src/main.rs`. A zero-config Go project with none of these fails with that list. An explicit entrypoint takes precedence over a `Dockerfile.vercel` marker. The Go and Rust buildpacks are pinned at 0.3.0, the first versions that read `VERCEL_ENTRYPOINT`, and the Ruby buildpack at 0.3.2.

### Patch Changes

- Updated dependencies [a19979c]
- Updated dependencies [a2e9f5d]
  - @vercel/build-utils@14.22.0

## 19.1.3

### Patch Changes

- Updated dependencies [bb42e81]
  - @vercel/build-utils@14.21.3

## 19.1.2

### Patch Changes

- Updated dependencies [cd68435]
  - @vercel/build-utils@14.21.2

## 19.1.1

### Patch Changes

- Updated dependencies [1336097]
  - @vercel/build-utils@14.21.1

## 19.1.0

### Minor Changes

- f4f3ff7: Always enabled buildpack cache. Bump the buildpacks to the latest version with cache support.

## 19.0.0

### Patch Changes

- 24a7e04: Accept `instances` for daemons in `vercel.json`. `replicas` is deprecated and ignored when `instances` is set. Daemon build output now writes `instances`.
- 7e396f7: Support `terminationGracePeriodSeconds` in `vercel.json#daemons`.
- 8845006: Accept Dockerfile and Containerfile names anywhere in the basename of explicit service and daemon entrypoints, such as `worker_Dockerfile`.
- Updated dependencies [24a7e04]
- Updated dependencies [7e396f7]
  - @vercel/build-utils@14.21.0

## 18.0.1

### Patch Changes

- 0d62534: Accept suffixed Dockerfile and Containerfile names in explicit service and daemon entrypoints.
- Updated dependencies [42cc083]
  - @vercel/build-utils@14.20.1

## 18.0.0

### Patch Changes

- Updated dependencies [e041037]
  - @vercel/build-utils@14.20.0

## 17.0.0

### Patch Changes

- Updated dependencies [e58b37a]
  - @vercel/build-utils@14.19.0

## 16.0.0

### Patch Changes

- ad69711: Reduce buildpack build times on Vercel by overlapping setup and cache restoration and exporting the image and cache in parallel. Move Buildah container cleanup into the background and add debug timings to help identify slow build steps.
- Updated dependencies [94f6cea]
- Updated dependencies [3eeaad5]
- Updated dependencies [8ac5320]
  - @vercel/build-utils@14.18.0

## 15.0.0

### Minor Changes

- 28a7ab7: Build top-level `daemons` when `VERCEL_ENABLE_DAEMONS_BOA=1`: `vercel build` builds the project as usual, pushes each daemon's Dockerfile image, and writes a Build Output API descriptor to `daemons/<name>/.vc-config.json`.

### Patch Changes

- Updated dependencies [28a7ab7]
- Updated dependencies [28a7ab7]
  - @vercel/build-utils@14.17.0

## 14.0.0

### Patch Changes

- Updated dependencies [20c5940]
  - @vercel/build-utils@14.16.0

## 13.0.0

### Minor Changes

- b0c985b: Build standalone Go servers with the Vercel Go buildpack and the container
  runtime when `VERCEL_EXPERIMENTAL_BUILDPACK_GO=1`, instead of running them
  behind the IPC proxy on Lambda. This applies to zero-config Go projects and
  Go services with a `go.mod` at their root, including `package main` and
  directory service entrypoints. `api/**/*.go` functions and Go handler
  entrypoints keep using `@vercel/go`.

  The build image is `golang:<version>-bookworm`, selected from the newer of
  the go.mod `toolchain` and `go` directives. The buildpack defaults to
  `GOTOOLCHAIN=local`, so the image's Go builds the module. It compiles the
  package a service entrypoint names, or else the one `@vercel/go` would
  build, passed as `VERCEL_GO_TARGET`, and the binary runs on distroless
  Debian 12.

- 5772e9e: Build Rust HTTP servers with a root `Cargo.toml` using the container builder when `VERCEL_EXPERIMENTAL_BUILDPACK_RUST=1`, selecting the build image from `rust-toolchain` or `rust-toolchain.toml` and serving `public/` from the root path. API functions and services with explicit file entrypoints continue using `@vercel/rust`.

### Patch Changes

- Updated dependencies [a7ef28c]
  - @vercel/build-utils@14.15.0

## 12.0.0

### Patch Changes

- Updated dependencies [deb48cd]
  - @vercel/build-utils@14.14.0

## 11.0.2

### Patch Changes

- Updated dependencies [ff3d2f7]
  - @vercel/build-utils@14.13.2

## 11.0.1

### Patch Changes

- Updated dependencies [5082546]
  - @vercel/build-utils@14.13.1

## 11.0.0

### Patch Changes

- Updated dependencies [34b2c8e]
  - @vercel/build-utils@14.13.0

## 10.1.0

### Minor Changes

- 42b7d4e: Persist buildpack dependency layers between deployments through the CNB lifecycle's directory cache under the repository's `.vercel/cache`. Enable with `VERCEL_ENABLE_BUILDPACK_CACHE=1`.
  Stop returning the Buildah layer store from `prepareCache`, which made the platform drop the entire build cache.

## 10.0.0

### Patch Changes

- Updated dependencies [6e68e60]
  - @vercel/build-utils@14.12.0

## 9.0.0

### Patch Changes

- Updated dependencies [888f59e]
- Updated dependencies [7eb63c0]
  - @vercel/build-utils@14.11.0

## 8.4.0

### Minor Changes

- 1cd2cfa: Bump the ruby buildpack version to 0.2.0

## 8.3.1

### Patch Changes

- Updated dependencies [53a6086]
  - @vercel/build-utils@14.10.2

## 8.3.0

### Minor Changes

- 4060042: Add `VERCEL_BUILDPACK_PRERELEASE_URL` to build with an unreleased buildpack.
  Set it to the full HTTPS URL of a `vercel-<name>-<version>.cnb` archive. The
  builder verifies it against the adjacent `.cnb.sha256` file and uses it for
  the matching buildpack in the runtime's group. Other buildpacks keep their
  pinned releases; missing or invalid prerelease files fail the build.

## 8.2.2

### Patch Changes

- 98b7677: Resolve a pushed image's digest from the registry when the push does not report it, instead of the local image store. Podman keeps locally-built layers uncompressed and gzips them on push, so the uploaded manifest hashes to a different digest than the one in `RepoDigests`; prebuilt container deployments then referenced a digest that did not exist in VCR. Both the Docker and buildah engines now fail the build if the pushed digest cannot be resolved rather than emitting a mutable tag.

## 8.2.1

### Patch Changes

- a953d36: Serve Vercel Queues and Runtime Cache from dedicated local ports in `vercel dev`, including projects without configured queue services. Poll-mode consumers can create consumer groups on first receive and read retained messages from the beginning of a topic. Every service, sidecar, function, and framework dev command receives the direct local endpoints, while container services use authenticated `/_svc` routes as container-reachable proxy aliases. The ports can be pinned with `--queue-port` and `--runtime-cache-port`; otherwise occupied defaults are incremented automatically. A `RUNTIME_CACHE_ENDPOINT` you set yourself still takes precedence.

## 8.2.0

### Minor Changes

- a88afa0: Route Ruby services and zero-config Ruby projects (Rails and Rack) to the
  experimental Ruby buildpack container builder behind
  `VERCEL_EXPERIMENTAL_BUILDPACK_RUBY=1`. The buildpack is selected only when a
  `Gemfile` sits at the build root and no file `entrypoint` narrows the build;
  services with an explicit `.rb`/`.ru` entrypoint keep building with
  `@vercel/ruby`. `vercel dev` reports that Ruby projects and services are not
  supported yet.

## 8.1.0

### Minor Changes

- f9d0e90: Add experimental Cloud Native Buildpacks lifecycle support with isolated source
  staging, pinned lifecycle and buildpack archives, and runtime-owned image
  resolution. Ruby images are selected from `.ruby-version`, `.tool-versions`, or
  the `tools.ruby` entry in `mise.toml`, then an exact Gemfile declaration,
  defaulting to Ruby 3.4. Unsupported version declarations fail with configuration
  guidance. Nothing selects a buildpack yet.

### Patch Changes

- Updated dependencies [f9d0e90]
- Updated dependencies [8a277e4]
- Updated dependencies [66e443e]
- Updated dependencies [08b0be2]
  - @vercel/build-utils@14.10.1

## 8.0.0

### Patch Changes

- Updated dependencies [2a57243]
- Updated dependencies [54a6d73]
- Updated dependencies [3d16792]
  - @vercel/build-utils@14.10.0

## 7.0.3

### Patch Changes

- Updated dependencies [55e8d1e]
  - @vercel/build-utils@14.9.3

## 7.0.2

### Patch Changes

- Updated dependencies [b174f14]
  - @vercel/build-utils@14.9.2

## 7.0.1

### Patch Changes

- Updated dependencies [1817491]
  - @vercel/build-utils@14.9.1

## 7.0.0

### Patch Changes

- Updated dependencies [392c759]
  - @vercel/build-utils@14.9.0

## 6.0.0

### Patch Changes

- Updated dependencies [a652a99]
  - @vercel/build-utils@14.8.0

## 5.0.0

### Patch Changes

- Updated dependencies [26b891e]
- Updated dependencies [37ff9da]
  - @vercel/build-utils@14.7.0

## 4.0.1

### Patch Changes

- Updated dependencies [aad9541]
  - @vercel/build-utils@14.6.1

## 4.0.0

### Patch Changes

- Updated dependencies [e82de48]
  - @vercel/build-utils@14.6.0

## 3.0.2

### Patch Changes

- f42a78a: Serve a shared Runtime Cache from `vercel dev`. Every service, sidecar, function, and framework dev command is pointed at one in-memory store owned by the dev server, so a value written by one process is readable by the others the way it is in a deployment. Previously each process fell back to its own in-process cache and cross-service reads always missed. A `RUNTIME_CACHE_ENDPOINT` you set yourself still takes precedence.

## 3.0.1

### Patch Changes

- Updated dependencies [a443e57]
  - @vercel/build-utils@14.5.1

## 3.0.0

### Patch Changes

- Updated dependencies [90afd71]
  - @vercel/build-utils@14.5.0

## 2.0.1

### Patch Changes

- Updated dependencies [e5b0363]
  - @vercel/build-utils@14.4.1

## 2.0.0

### Patch Changes

- Updated dependencies [f8add0a]
  - @vercel/build-utils@14.4.0

## 1.0.0

### Patch Changes

- 0d71a61: Declare `@vercel/build-utils` as a peer dependency provided by Vercel CLI so builders load correctly with strict dependency isolation, including pnpm global installs.
- Updated dependencies [0b08df6]
- Updated dependencies [cd6b038]
- Updated dependencies [96444ba]
  - @vercel/build-utils@14.3.0

## 0.2.0

### Minor Changes

- 28a2dd0: Expose the resolved rewrite destination as the request path observed by containers, and warn affected container projects about the behavior change.

## 0.1.1

### Patch Changes

- 6d7fbfa: Bump all workspace packages to trigger a full publish from vercel-internal.

## 0.1.0

### Minor Changes

- 67d02cb: Add package manifest to container builder.

## 0.0.5

### Patch Changes

- 8d25cea: Apply `functions` configuration (`memory`, `maxDuration`, `architecture`, `regions`, `functionFailoverRegions`, `experimentalTriggers`, `supportsCancellation`) to container runtime outputs. The `@vercel/container` builder now resolves matching `vercel.json` / per-service `functions` entries at build time, and the CLI writes those settings into the container `.vc-config.json`.

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
