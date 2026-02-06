import { join, posix as posixPath } from 'path';
import { pathExists } from 'fs-extra';
import { debug } from '@vercel/build-utils';

export const GO_CANDIDATE_ENTRYPOINTS = [
  'main.go',
  'cmd/api/main.go',
  'cmd/server/main.go',
];

/**
 * Search for a Go entrypoint within a single directory.
 * Returns a path relative to `dir`.
 */
async function detectInDir(
  dir: string,
  configuredEntrypoint: string
): Promise<string | null> {
  if (await pathExists(join(dir, configuredEntrypoint))) {
    debug(`Using configured Go entrypoint: ${configuredEntrypoint}`);
    return configuredEntrypoint;
  }

  for (const candidate of GO_CANDIDATE_ENTRYPOINTS) {
    if (await pathExists(join(dir, candidate))) {
      debug(`Detected Go entrypoint: ${candidate}`);
      return candidate;
    }
  }

  return null;
}

/**
 * Detect the Go entrypoint for standalone server mode.
 * Checks the configured entrypoint first, then searches candidate locations.
 *
 * When a `serviceWorkspace` is provided (e.g. `"backend"` from the service
 * resolver), detection is scoped to that directory.
 */
export async function detectGoEntrypoint(
  workPath: string,
  configuredEntrypoint: string,
  serviceWorkspace?: string
): Promise<string | null> {
  if (serviceWorkspace) {
    const workspacePath = join(workPath, serviceWorkspace);
    const localEntrypoint = configuredEntrypoint.startsWith(
      serviceWorkspace + '/'
    )
      ? configuredEntrypoint.slice(serviceWorkspace.length + 1)
      : configuredEntrypoint;

    const result = await detectInDir(workspacePath, localEntrypoint);
    return result ? posixPath.join(serviceWorkspace, result) : null;
  }

  return detectInDir(workPath, configuredEntrypoint);
}
