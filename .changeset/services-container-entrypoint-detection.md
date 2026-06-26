---
'@vercel/fs-detectors': patch
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
