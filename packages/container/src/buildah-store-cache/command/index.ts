import { join } from 'node:path';
import { run } from '../../util';
import type { FileLock } from '../lock';
import type { StoreCommandRequest, StoreCommandResults } from './types';

/** Both entry points are bundled into the same directory. */
export const STORE_COMMAND_SCRIPT = join(__dirname, 'buildah-store-command.js');

export function storeCommand(
  request: StoreCommandRequest,
  script = STORE_COMMAND_SCRIPT
): string[] {
  return [process.execPath, script, JSON.stringify(request)];
}

/** Runs a store command while holding `lock` exclusively. */
export async function runStoreCommand<
  R extends Exclude<StoreCommandRequest, { action: 'cleanup' }>,
>(request: R, lock: FileLock): Promise<StoreCommandResults[R['action']]> {
  const [command, ...args] = lock.exclusive(storeCommand(request));
  const { stdout } = await run(command, args, { quiet: true });
  return JSON.parse(stdout);
}
