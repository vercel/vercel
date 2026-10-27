import { spawn } from 'node:child_process';

export const NATIVE_UPDATE_CHILD_ENV = 'VERCEL_NATIVE_UPDATE_CHILD';
export const NATIVE_UPDATE_VERSION_ENV = 'VERCEL_NATIVE_UPDATE_VERSION';
export const NATIVE_UPDATE_SELECT_PRODUCTION_ENV =
  'VERCEL_NATIVE_UPDATE_SELECT_PRODUCTION';

export function isNativeUpdateChild(): boolean {
  return process.env[NATIVE_UPDATE_CHILD_ENV] === '1';
}

function spawnDetachedUpdate(env: NodeJS.ProcessEnv): void {
  const child = spawn(process.execPath, ['version', 'check'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env,
  });
  child.on('error', () => {});
  child.unref();
}

export function spawnNativeUpdateCheck(): void {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    [NATIVE_UPDATE_CHILD_ENV]: '1',
    [NATIVE_UPDATE_SELECT_PRODUCTION_ENV]: '0',
  };
  delete env[NATIVE_UPDATE_VERSION_ENV];
  spawnDetachedUpdate(env);
}

export function spawnNativeUpdateChild(
  version: string,
  selectProduction: boolean
): void {
  spawnDetachedUpdate({
    ...process.env,
    [NATIVE_UPDATE_CHILD_ENV]: '1',
    [NATIVE_UPDATE_VERSION_ENV]: version,
    [NATIVE_UPDATE_SELECT_PRODUCTION_ENV]: selectProduction ? '1' : '0',
  });
}
