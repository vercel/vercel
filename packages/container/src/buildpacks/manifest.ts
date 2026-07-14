/**
 * Buildpacks builder manifest — controls which builder image we vendor
 * lifecycle execution against.
 *
 * Lifecycle itself lives *inside* the builder image at `/cnb/lifecycle/creator`
 * — we don't vendor pack or lifecycle binaries on the host. We just pull the
 * builder OCI image via the already-vendored container engine (docker / podman
 * / podman-private) and run:
 *
 *   $engine run --rm builder /cnb/lifecycle/creator -app=/workspace -cache-dir=...
 *
 * That means zero extra binaries to vendor, isolated execution, and no PATH
 * pollution. The builder pull is cached by the engine's image store (private
 * store for podman-private, isolated under ~/.vercel/runtimes/podman/).
 *
 * Overridable for testing:
 *   VERCEL_BUILDPACK_BUILDER=paketobuildpacks/builder:base
 *   VERCEL_BUILDPACK_BUILDER=ghcr.io/my/org/builder:dev
 */

// jammy-base is multi-arch (amd64+arm64) but some mirrors/shims still only have
// amd64. Default to the canonical multi-arch ref — engine pull will grab host arch
// when the manifest list exists, else fall back to amd64 container (still runs under
// podman machine's linux/arm64 VM via qemu if needed, slower but works).
const DEFAULT_BUILDER = 'paketobuildpacks/builder-jammy-base:latest';

// For lifecycle version tracking / diagnostics only — not downloaded directly
// since lifecycle ships inside the builder image. Keep in sync with the
// builder's bundled lifecycle where possible.
export const LIFECYCLE_VENDOR_VERSION = '0.20.5';

export function builderImageRef(): string {
  const override = process.env.VERCEL_BUILDPACK_BUILDER?.trim();
  if (override) return override;
  return DEFAULT_BUILDER;
}

/**
 * Host directory layout for buildpacks caches, if we ever want to persist
 * buildpacks layer cache across builds on a machine (dev only).
 *
 * For now lifecycle's own -cache-dir is mapped to a volume mount inside the
 * creator container; the host side can be ephemeral (podman --rm) or we can
 * pin it under privateRoot() later.
 */
export function defaultCacheVolumeName(serviceName: string): string {
  const safe = serviceName.toLowerCase().replace(/[^a-z0-9_.-]/g, '-');
  return `vercel-bp-cache-${safe || 'service'}`;
}
