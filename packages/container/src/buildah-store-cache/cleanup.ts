import { spawn } from 'node:child_process';
import { buildahStorageArgs } from '../storage-driver';
import { debug } from '../util';
import { storeCommand } from './command';
import { buildahStoreCacheEnabled } from './config';
import { sharedBuildahStoreLock } from './lock';
import { CLEANUP_CONTAINER_RE, writeStateRecord } from './state';

/** The detached, shared-lock command can outlive the builder process. */
export async function startContainerCleanup(name: string): Promise<void> {
  const rmArgs = [...(await buildahStorageArgs()), 'rm', name];
  debug(`exec in the background: buildah ${rmArgs.join(' ')}`);
  const start = Date.now();
  const [command, ...commandArgs] = await cleanupCommand(name, rmArgs);
  const child = spawn(command, commandArgs, {
    detached: true,
    stdio: 'ignore',
  });
  child.on('error', error =>
    debug(`background buildah rm failed: ${error.message}`)
  );
  child.on('exit', code =>
    debug(
      `background buildah rm exited with code ${code} after ${Date.now() - start}ms`
    )
  );
  child.unref();
}

/** With the store cache, the cleanup is recorded first so a cache save can finish it. */
async function cleanupCommand(
  container: string,
  buildahArgs: string[]
): Promise<string[]> {
  const record = await recordPendingCleanup(container);
  return sharedBuildahStoreLock.wrap(
    record
      ? storeCommand({ action: 'cleanup', options: { record, buildahArgs } })
      : ['buildah', ...buildahArgs]
  );
}

async function recordPendingCleanup(
  container: string
): Promise<string | undefined> {
  if (!buildahStoreCacheEnabled()) {
    return undefined;
  }
  try {
    if (!CLEANUP_CONTAINER_RE.test(container)) {
      throw new Error('invalid Buildah cleanup container');
    }
    return await writeStateRecord('.cleanup', `${container}\n`);
  } catch (error) {
    debug(`could not record Buildah cleanup: ${(error as Error).message}`);
    return undefined;
  }
}
