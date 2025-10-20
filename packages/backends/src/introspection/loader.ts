import { BuildV2, Files } from '@vercel/build-utils';
import { spawn } from 'child_process';
import { resolve, join, dirname } from 'path';

type RolldownResult = {
  dir: string;
  handler: string;
  files: Files;
};

const getPackageRoot = () => {
  try {
    const packageJsonPath = require.resolve('@vercel/backends/package.json');
    return dirname(packageJsonPath);
  } catch {
    if (__dirname.includes('/src/')) {
      return resolve(join(__dirname, '..', '..'));
    } else {
      return resolve(join(__dirname, '..'));
    }
  }
};

export const introspectApp = async (
  args: Parameters<BuildV2>[0],
  rolldownResult: RolldownResult
) => {
  const packageRoot = getPackageRoot();
  const cjsLoaderPath = resolve(join(packageRoot, 'dist/loaders/cjs.cjs'));
  const esmLoaderPath = resolve(join(packageRoot, 'dist/loaders/esm.js'));
  const handlerPath = join(rolldownResult.dir, rolldownResult.handler);

  await new Promise(resolvePromise => {
    try {
      // Use both -r (for CommonJS/require) and --import (for ESM/import)
      const child = spawn(
        'node',
        ['-r', cjsLoaderPath, '--import', esmLoaderPath, handlerPath],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: rolldownResult.dir,
          env: {
            ...process.env,
            ...(args.meta?.env || {}),
            ...(args.meta?.buildEnv || {}),
          },
        }
      );

      child.stdout?.on('data', data => {
        console.log('[LOADER]', data.toString());
      });

      child.stderr?.on('data', data => {
        console.log('[LOADER]', data.toString());
      });

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
      }, 2000);

      child.on('error', err => {
        clearTimeout(timeout);
        console.log(`Loader error: ${err.message}`);
        resolvePromise(undefined);
      });

      child.on('close', () => {
        clearTimeout(timeout);
        resolvePromise(undefined);
      });
    } catch (error) {
      console.log('Failed to run loader');
      resolvePromise(undefined);
    }
  });

  // For now, return empty routes
  const routes = [
    {
      handle: 'filesystem',
    },
    {
      src: '/(.*)',
      dest: '/',
    },
  ];

  return { routes, files: rolldownResult.files };
};
