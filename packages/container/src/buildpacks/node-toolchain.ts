import type { BuildOptions } from '@vercel/build-utils';
import { getNodeVersion, isBunVersion } from '@vercel/build-utils';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface NodeToolchain {
  /** Directory containing `bin/node` and `bin/npm` inside the build container. */
  home: string;
  version: string;
  major: number;
}

/**
 * Select the Node.js major for a buildpack project with a `package.json`,
 * honoring `engines.node`. Node is build-only (asset bundling) and never part
 * of the exported image.
 */
async function selectNodeMajor(
  workPath: string,
  config: BuildOptions['config'],
  meta: BuildOptions['meta']
): Promise<NodeToolchain | undefined> {
  if (!existsSync(join(workPath, 'package.json'))) {
    return undefined;
  }

  const version = await getNodeVersion(workPath, undefined, config, meta);
  if (isBunVersion(version)) {
    throw new Error(
      'Buildpack asset builds require Node.js. Bun is not supported yet; configure engines.node or use Dockerfile.vercel.'
    );
  }

  return {
    home: `/node${version.major}`,
    version: version.range,
    major: version.major,
  };
}

/**
 * Resolve a Node.js toolchain from the Vercel build environment's pinned
 * `/node<major>` installations, which are read-only mounted into the
 * lifecycle container.
 */
export async function resolveNodeToolchain(
  workPath: string,
  config: BuildOptions['config'],
  meta: BuildOptions['meta']
): Promise<NodeToolchain | undefined> {
  const toolchain = await selectNodeMajor(workPath, config, meta);
  if (!toolchain) {
    return undefined;
  }

  for (const executable of ['node', 'npm']) {
    if (!existsSync(join(toolchain.home, 'bin', executable))) {
      throw new Error(
        `The selected Node.js ${toolchain.version} installation is missing ${toolchain.home}/bin/${executable} in the build environment.`
      );
    }
  }

  return toolchain;
}

/**
 * Resolve a Node.js toolchain for a local docker build. No host probes: the
 * docker lifecycle runner bakes `node:<major>-bookworm-slim`'s `/usr/local`
 * into the derived build image at the toolchain home.
 */
export async function resolveLocalNodeToolchain(
  workPath: string,
  config: BuildOptions['config'],
  meta: BuildOptions['meta']
): Promise<NodeToolchain | undefined> {
  return selectNodeMajor(workPath, config, meta);
}
