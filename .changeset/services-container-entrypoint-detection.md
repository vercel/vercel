---
'@vercel/fs-detectors': patch
'@vercel/container': patch
'@vercel/frameworks': patch
---

[services] Refine container detection for `services` / `experimentalServicesV2`.

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
