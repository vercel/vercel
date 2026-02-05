/**
 * OCaml entrypoint detection for Vercel runtime framework preset mode.
 *
 * This module handles detecting and validating OCaml entrypoints for standalone
 * server deployments.
 */

import { join } from 'path';
import { pathExists } from 'fs-extra';
import { debug } from '@vercel/build-utils';

// Candidate entrypoints for OCaml runtime framework preset (in priority order)
export const OCAML_CANDIDATE_ENTRYPOINTS = [
  'bin/main.ml',
  'src/main.ml',
  'main.ml',
  'bin/server.ml',
  'src/server.ml',
  'app.ml',
];

/**
 * Detect the OCaml entrypoint for standalone server mode.
 * Checks the configured entrypoint first, then searches candidate locations.
 */
export async function detectOcamlEntrypoint(
  workPath: string,
  configuredEntrypoint: string
): Promise<string | null> {
  // If the configured entrypoint exists, use it
  if (await pathExists(join(workPath, configuredEntrypoint))) {
    debug(`Using configured OCaml entrypoint: ${configuredEntrypoint}`);
    return configuredEntrypoint;
  }

  // Search candidate locations
  for (const candidate of OCAML_CANDIDATE_ENTRYPOINTS) {
    if (await pathExists(join(workPath, candidate))) {
      debug(`Detected OCaml entrypoint: ${candidate}`);
      return candidate;
    }
  }

  return null;
}
