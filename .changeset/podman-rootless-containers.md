---
'@vercel/container': minor
---

Add rootless Podman support for `vercel dev` so users can run containers locally without Docker Desktop or elevated permissions.

- New `podman` container engine (`podman machine init --rootful=false` on macOS, daemonless rootless on Linux) — no `dockerd`, no privileged helper, no `docker` group / socket permissions required.
- `vercel dev` now probes container engines in order (`docker` → `podman`) via `selectDevEngine`; falls back to Podman automatically when Docker is not installed or daemon is unreachable.
- Override with `VERCEL_CONTAINER_ENGINE=podman|docker|buildah` to force a specific engine; clear errors when the selected engine is not available.
- Engine-agnostic dev interface (`devBuild`, `devRun`, `devPort`, `devStop`, `devInspectExposedPorts`, `devEnsureAvailable`, `DevOutput`, `DevContainerHandle`) so Docker stays as fallback and future engines (Apple Container) can plug in.
- Podman on macOS auto-starts or auto-initializes a rootless machine (`--rootful=false`) and provides actionable hints (`podman machine start`, `brew install podman`).
- Podman build/run paths use `--password-stdin` for registry auth and never require `sudo` or `--privileged`.
- Updated error messages to guide users to rootless alternative: `Docker not found ... set VERCEL_CONTAINER_ENGINE=podman`.
