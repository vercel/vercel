---
'@vercel/container': minor
'vercel': patch
---

Container dev improvements: vendored buildpacks lifecycle path + `vc dev` routing fix for lone container services.

- New `packages/container/src/buildpacks/` (detect, manifest, lifecycle): framework-driven buildpack detection (`framework: container` → lifecycle/creator inside Paketo builder) so non-Dockerfile services (Go/Rust/Java) can build via `@vercel/container` without a Dockerfile. Node/Python are excluded (claimed by their own builders). Build path wires OIDC VCR auth (`VCR_REGISTRY`) and reuses the selected engine.
- `ContainerEngine` dev interface now exercises `docker → podman → podman-private` auto-install via `selectDevEngine`. `VERCEL_CONTAINER_ENGINE=podman-private` forces the private runtime (~/.vercel/runtimes/podman, applehv rootless, no Docker, no brew).
- Fix `vc dev` single-service container routing: `services-orchestrator.ts:getV2StartSpec` previously returned `routePrefixes: []` for V2 services, so a lone container service with `root: "."` fell through to static file listing ("Files within /" → 404). Now root `"."` or sole container-framework service gets `["/"]`, so `/` and `/hard/*` proxy to the container — `vc dev -L` works with no harness and no link.
- Includes hard torture verification (`/hard/rootless`, `/hard/tmpdir`, `/hard/env`, `/hard/ports`, etc.) exercised against `podman-private` (arch=arm64, `/.dockerenv` absent, `/run/.containerenv` true, TMPDIR stripped, `SSH_`/`XPC_`/`__` stripped, quarantine xattr clean).
