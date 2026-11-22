import type { ServiceRuntime } from '@vercel/build-utils';

/**
 * Runtimes that can build container images with Cloud Native Buildpacks,
 * with the files (any one of them, at the build root) that mark a project
 * the buildpack can build. Keep this in sync with `@vercel/container`'s
 * buildpack registry (`BUILDPACKS[].projectMarkers`).
 *
 * Routing is per runtime on purpose: the platform decides which buildpack to
 * run from the language markers, and the buildpack classifies the application
 * from its sources. There are no framework-level presets for buildpack
 * runtimes.
 *
 * Only whole-project and service builds route here. `api/**` function files
 * keep their Lambda runtime: they never reach the framework or service
 * routing that selects a buildpack.
 */
export const BUILDPACK_PROJECT_MARKERS: ReadonlyMap<
  ServiceRuntime,
  readonly string[]
> = new Map([
  ['ruby', ['Gemfile']],
  ['go', ['go.mod']],
  ['rust', ['Cargo.toml']],
]);

// Lives in fs-detectors (bundled into builders) rather than build-utils
// (resolved from the build image, which may lag behind). Evaluated per call:
// tests and the build container set the flag after import.
export function isBuildpackRuntimeEnabled(runtime: string): boolean {
  return (
    process.env[`VERCEL_EXPERIMENTAL_BUILDPACK_${runtime.toUpperCase()}`] ===
    '1'
  );
}

/** The runtime's buildpack, when one exists and its flag is on. */
export function toBuildpackRuntime(
  runtime: string | null | undefined
): ServiceRuntime | undefined {
  if (
    !runtime ||
    !BUILDPACK_PROJECT_MARKERS.has(runtime as ServiceRuntime) ||
    !isBuildpackRuntimeEnabled(runtime)
  ) {
    return undefined;
  }
  return runtime as ServiceRuntime;
}

/**
 * Whether the build root carries one of the buildpack's project markers.
 * `hasFile` is checked against exact root-relative names, never ancestors or
 * nested directories: the buildpack stages the root as-is, and the legacy
 * runtime keeps building projects that lack the marker.
 */
export async function hasBuildpackProjectMarker(
  runtime: ServiceRuntime,
  hasFile: (name: string) => Promise<boolean> | boolean
): Promise<boolean> {
  for (const marker of BUILDPACK_PROJECT_MARKERS.get(runtime) ?? []) {
    if (await hasFile(marker)) {
      return true;
    }
  }
  return false;
}

/**
 * The package a Go source file declares in its package clause, skipping the
 * comments and build constraints that may precede it.
 */
export function getGoPackageName(source: string): string | undefined {
  let rest = source.replace(/^\uFEFF/, '');
  for (;;) {
    rest = rest.trimStart();
    if (rest.startsWith('//')) {
      const newline = rest.indexOf('\n');
      if (newline === -1) return undefined;
      rest = rest.slice(newline + 1);
    } else if (rest.startsWith('/*')) {
      const end = rest.indexOf('*/', 2);
      if (end === -1) return undefined;
      rest = rest.slice(end + 2);
    } else {
      break;
    }
  }
  return /^package\s+([\p{L}_][\p{L}\p{N}_]*)/u.exec(rest)?.[1];
}
