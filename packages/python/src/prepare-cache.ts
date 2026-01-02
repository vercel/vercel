import { glob, type PrepareCache, type Files } from '@vercel/build-utils';
import { hasVercelInstallScript } from './utils';

export const prepareCache: PrepareCache = async ({ workPath, config }) => {
  const cacheFiles: Files = {};
  const framework = (config as any)?.framework as string | undefined;

  let hasCustomInstall = false;
  if (framework === 'fastapi' || framework === 'flask') {
    const installCommand = (config as any)?.projectSettings?.installCommand;
    if (typeof installCommand === 'string' && installCommand.trim()) {
      hasCustomInstall = true;
    } else if (
      await hasVercelInstallScript(workPath, [
        'vercel-install',
        'now-install',
        'install',
      ])
    ) {
      hasCustomInstall = true;
    }
  }

  // Only persist the Python virtualenv between builds when using the default
  // uv-managed installation flow. When custom install hooks are configured,
  // the virtualenv is expected to be managed entirely by the user, and we
  // don't want to risk stale dependencies accumulating via caching.
  if (!hasCustomInstall) {
    Object.assign(cacheFiles, await glob('.vercel/python/**', workPath));
  }

  return cacheFiles;
};
