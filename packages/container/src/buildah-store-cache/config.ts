import { isBuildContainer, readString } from '../util';

export const BUILDAH_STORE_CACHE_FLAG = 'VERCEL_BUILDAH_STORE_CACHE';

export function buildahStoreCacheRequested(): boolean {
  return isBuildContainer() && process.env[BUILDAH_STORE_CACHE_FLAG] === '1';
}

/** Services coordinate through per-deployment state, which needs the deployment ID. */
export function buildahStoreCacheEnabled(): boolean {
  return buildahStoreCacheRequested() && deploymentId() !== undefined;
}

export function deploymentId(): string | undefined {
  return readString(process.env.VERCEL_DEPLOYMENT_ID);
}
