---
'@vercel/fs-detectors': patch
'@vercel/container': patch
'@vercel/frameworks': patch
---

[services] Refine container detection for `services` / `experimentalServicesV2`.

- A supplied `entrypoint` infers `runtime: "container"` when it names a
  `Dockerfile`, `Containerfile`, or any `Dockerfile.*` / `Containerfile.*`
  (e.g. `Dockerfile.prod`, `Dockerfile.vercel`).
- `runtime: "container"` without an `entrypoint` now auto-detects a Dockerfile
  in the service root, probing the blessed names `Dockerfile.vercel`,
  `Containerfile.vercel`, `Dockerfile`, `Containerfile` (in that order, so a
  `.vercel` opt-in marker takes precedence over a plain `Dockerfile`).
- Removed the prebuilt OCI image reference entrypoint: an `entrypoint` must now
  name a Dockerfile/Containerfile, otherwise the service errors.
- `@vercel/container` now recognizes the same broad `Dockerfile.*` /
  `Containerfile.*` set (via a shared `isDockerfileRef`), so a suffixed
  entrypoint handed over by services is built with `-f <path>` instead of
  being ignored in favor of a default `Dockerfile` or treated as a prebuilt
  image reference.
- The `container` framework preset is no longer experimental: a project with a
  `Dockerfile.vercel` / `Containerfile.vercel` marker is detected as a
  container without `VERCEL_USE_EXPERIMENTAL_FRAMEWORKS`.
