import type { BuildahClient } from '../clients/buildah';
import { isBuildContainer, readString } from '../util';
import { createBuildahEngine } from './buildah';
import { dockerEngine } from './docker';
import type { ContainerEngine } from './types';

/**
 * Pick the container image toolchain for this environment. The Vercel build
 * container uses buildah (daemonless); developer machines use docker.
 *
 * Override with `VERCEL_CONTAINER_ENGINE=docker|buildah` for testing.
 */
export function selectContainerEngine(client: BuildahClient): ContainerEngine {
  const override = readString(
    process.env.VERCEL_CONTAINER_ENGINE
  )?.toLowerCase();
  if (override === 'buildah') return createBuildahEngine(client);
  if (override === 'docker') return dockerEngine;
  return isBuildContainer() ? createBuildahEngine(client) : dockerEngine;
}

export type { BuildPushParams, ContainerEngine } from './types';
export { VCR_REGISTRY, TARGET_PLATFORM } from './types';
