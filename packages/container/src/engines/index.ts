import { isBuildContainer, readString } from '../util';
import { buildahEngine } from './buildah';
import { dockerEngine } from './docker';
import type { ContainerEngine } from './types';

/**
 * Pick the container image toolchain for this environment. The Vercel build
 * container uses buildah (daemonless); developer machines use docker.
 *
 * Override with `VERCEL_CONTAINER_ENGINE=docker|buildah` for testing.
 */
export function selectContainerEngine(): ContainerEngine {
  const override = readString(
    process.env.VERCEL_CONTAINER_ENGINE
  )?.toLowerCase();
  if (override === 'buildah') return buildahEngine;
  if (override === 'docker') return dockerEngine;
  return isBuildContainer() ? buildahEngine : dockerEngine;
}

export type { BuildPushParams, ContainerEngine } from './types';
export { VCR_REGISTRY, TARGET_PLATFORM } from './types';
