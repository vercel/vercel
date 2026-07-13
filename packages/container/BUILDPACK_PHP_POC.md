# Buildpack POC: PHP via `server.php` auto-detection

## Scope

Narrow POC: when `VERCEL_BUILDPACKS=1` is set and a project has `server.php` (or `index.php`)
at the service root with `runtime: "container"` in vercel.json, `@vercel/container` builds the
project via Paketo's PHP buildpacks instead of requiring a Dockerfile.

No Node.js, no pnpm, no staging copy — PHP doesn't have node_modules contamination.
Docker required (user brings their own). No podman-private vendoring.

## Files to create/modify

### `packages/container/src/buildpacks/` (new)

- `detect.ts` — checks for PHP source markers (`server.php`, `index.php`, `composer.json`).
  Gated on `VERCEL_BUILDPACKS=1`. Returns whether this is a buildpack project.
- `manifest.ts` — builder image ref. Default: `paketobuildpacks/builder-jammy-full:latest`
  (includes PHP buildpacks). Override via `VERCEL_BUILDPACK_BUILDER`.
- `lifecycle.ts` — invokes `/cnb/lifecycle/creator` inside the builder image via the
  selected engine. Docker: `--daemon` + mount docker.sock. No Podman layout flow (keep
  it simple — Docker only for POC). Required env: `CNB_PLATFORM_API=0.13`.
- `index.ts` — re-exports.

### `packages/container/src/index.ts` (modify)

`resolveImageHandler`: when no Dockerfile and no prebuilt image, check buildpack detection.
If buildpack → dev returns local tag, cloud calls `buildViaBuildpackAndPush`.

### `packages/container/src/dev.ts` (modify)

`resolveDevImage`: when no Dockerfile, check buildpack detection. If buildpack →
`buildWithLifecycle` → return tag → existing `devRun` launches it.

### `packages/fs-detectors/src/services/resolve-v2.ts` (modify)

`resolveContainerServiceV2`: when `runtime: "container"` and no Dockerfile found,
check for PHP markers (gated by feature flag). If found, use `<detect>` as entrypoint
instead of erroring.

### `packages/container/test/unit.test.ts` (modify)

Add tests for buildpack detection: `server.php` present + flag on → buildpack path.
Flag off → error (existing behavior).

## Builder

`paketobuildpacks/builder-jammy-full:latest` — includes `paketo-buildpacks/php` which
detects `composer.json` or `*.php` files and builds with PHP + Apache/Nginx.
Lifecycle `/cnb/lifecycle/creator` is embedded in the builder image.

## Feature flag

`VERCEL_BUILDPACKS=1` — checked by:
1. `fs-detectors/resolve-v2.ts` — allows non-Dockerfile container entrypoints
2. `container/buildpacks/detect.ts` — enables PHP marker detection

Without the flag: existing behavior unchanged (Dockerfile or prebuilt image only).
