/**
 * Go entrypoint detection for Vercel runtime framework preset mode.
 *
 * This module handles detecting and validating Go entrypoints for standalone
 * server deployments (not go-bridge wrapped handlers).
 */

import { join } from 'path';
import { pathExists } from 'fs-extra';
import { debug } from '@vercel/build-utils';

// Candidate entrypoints for Go runtime framework preset (in priority order)
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
