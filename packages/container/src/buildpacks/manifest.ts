/**
 * Buildpack builder manifest — controls which Paketo builder image we run
 * `/cnb/lifecycle/creator` against.
 *
 * Lifecycle is embedded *inside* the builder image at `/cnb/lifecycle/creator`.
 * We don't vendor `pack` or lifecycle binaries on the host — we just pull the
 * builder OCI image via the container engine and run creator directly.
 *
 * `builder-jammy-full` includes PHP buildpacks (along with Node, Go, Java, Ruby,
 * Python, etc). It's larger than `jammy-base` (~1.2GB vs ~300MB) but is the only
 * Paketo builder that includes PHP. For the POC this is fine — the pull is cached
 * by Docker's image store.
 *
 * Override for testing:
 *   VERCEL_BUILDPACK_BUILDER=paketobuildpacks/builder-jammy-base:latest
 *   VERCEL_BUILDPACK_BUILDER=ghcr.io/my/org/builder:dev
 */

const DEFAULT_BUILDER = 'paketobuildpacks/builder-jammy-full:latest';

export function builderImageRef(): string {
  const override = process.env.VERCEL_BUILDPACK_BUILDER?.trim();
  if (override) return override;
  return DEFAULT_BUILDER;
}
