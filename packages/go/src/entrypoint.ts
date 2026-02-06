import { debug } from '@vercel/build-utils';
import { pathExists } from 'fs-extra';
import { join } from 'path';

export const GO_CANDIDATE_ENTRYPOINTS = [
  'main.go',
  'cmd/api/main.go',
  'cmd/server/main.go',
];

/**
 * Detect the Go entrypoint for standalone server mode.
 * Checks the configured entrypoint first, then searches candidate locations.
 */
export async function detectGoEntrypoint(
  workPath: string,
  configuredEntrypoint: string
): Promise<string | null> {
  // If the configured entrypoint exists, use it
  if (await pathExists(join(workPath, configuredEntrypoint))) {
    debug(`Using configured Go entrypoint: ${configuredEntrypoint}`);
    return configuredEntrypoint;
  }

  // Search candidate locations
  for (const candidate of GO_CANDIDATE_ENTRYPOINTS) {
    if (await pathExists(join(workPath, candidate))) {
      debug(`Detected Go entrypoint: ${candidate}`);
      return candidate;
    }
  }

  return null;
}
