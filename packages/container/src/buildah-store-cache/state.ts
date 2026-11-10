import { randomUUID } from 'node:crypto';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deploymentId } from './config';

export const CLEANUP_CONTAINER_RE = /^vercel-cnb-[a-zA-Z0-9_.-]+$/;

export type StateRecordSuffix = '.images' | '.cleanup';

/** Shared by every service's builder process and the later `prepareCache` calls. */
export function buildahStoreStateDirectory(): string {
  const deployment = deploymentId();
  if (!deployment) {
    throw new Error('VERCEL_DEPLOYMENT_ID is not set');
  }
  return join(
    tmpdir(),
    'vercel-buildah-store',
    deployment.replace(/[^a-zA-Z0-9_-]/g, '_')
  );
}

export async function createBuildahStoreStateDirectory(): Promise<string> {
  const directory = buildahStoreStateDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return directory;
}

/** Concurrent service builds each write their own record for the cache save. */
export async function writeStateRecord(
  suffix: StateRecordSuffix,
  contents: string
): Promise<string> {
  const path = join(
    await createBuildahStoreStateDirectory(),
    `${randomUUID()}${suffix}`
  );
  await writeFile(path, contents, { mode: 0o600, flag: 'wx' });
  return path;
}

export async function listStateRecords(
  directory: string,
  suffix: StateRecordSuffix
): Promise<string[]> {
  return (await readdir(directory))
    .filter(name => !name.startsWith('.') && name.endsWith(suffix))
    .sort()
    .map(name => join(directory, name));
}
