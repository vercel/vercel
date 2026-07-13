import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Whether buildpack-based builds are enabled for this project.
 *
 * Gated on `VERCEL_BUILDPACKS=1` — a feature flag controlled by the platform.
 * When off, the container builder only accepts Dockerfiles and prebuilt images
 * (existing behavior, unchanged).
 */
export function isBuildpacksEnabled(): boolean {
  return process.env.VERCEL_BUILDPACKS === '1';
}

/**
 * Source markers that indicate a PHP project suitable for buildpack builds.
 *
 * `composer.json` is the PHP equivalent of `package.json` — its presence signals
 * a PHP project. `server.php` and `index.php` are the conventional entry points
 * for a PHP web app (Laravel, Symfony, plain PHP). We don't claim projects that
 * only have `.php` files scattered around without one of these markers — the
 * user should opt in explicitly via `runtime: "container"` in vercel.json.
 */
const PHP_MARKERS = ['composer.json', 'server.php', 'index.php'];

/**
 * Whether the project at `workPath` is a PHP project that can be built via
 * Paketo's PHP buildpacks (no Dockerfile needed).
 *
 * Rules:
 *   1. `VERCEL_BUILDPACKS=1` must be set (feature flag).
 *   2. No Dockerfile present (Dockerfile takes precedence).
 *   3. At least one PHP marker file exists in the service root.
 */
export function isPhpBuildpackProject(workPath: string): boolean {
  if (!isBuildpacksEnabled()) return false;
  if (existsSync(join(workPath, 'Dockerfile'))) return false;
  if (existsSync(join(workPath, 'Dockerfile.vercel'))) return false;
  if (existsSync(join(workPath, 'Containerfile'))) return false;
  if (existsSync(join(workPath, 'Containerfile.vercel'))) return false;
  return PHP_MARKERS.some(name => existsSync(join(workPath, name)));
}
