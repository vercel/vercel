import { BuildV2, Files } from '@vercel/build-utils';
import { spawn } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

type RolldownResult = {
  dir: string;
  handler: string;
  files: Files;
};

export const introspectApp = async (
  args: Parameters<BuildV2>[0],
  rolldownResult: RolldownResult
) => {
  const thisDistDir = dirname(fileURLToPath(import.meta.url));
  const cjsLoaderPath = new URL('loaders/cjs.cjs', import.meta.url).href;
  const esmLoaderPath = new URL('loaders/esm.js', import.meta.url).href;
  const handlerPath = new URL(rolldownResult.handler, import.meta.url).href;
  console.log({
    cjsLoaderPath,
    thisDistDir,
    esmLoaderPath,
    handlerPath,
  });

  let introspectionRoutes: { src: string; dest: string; methods: string[] }[] =
    [];

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
        // console.log('[LOADER]', data.toString());
        try {
          const introspection = JSON.parse(data.toString());
          const introspectionSchema = z.object({
            routes: z.array(
              z.object({
                src: z.string(),
                dest: z.string(),
                methods: z.array(z.string()),
              })
            ),
          });
          const introspectionResult = introspectionSchema.parse(introspection);
          introspectionRoutes = introspectionResult.routes;
        } catch (error) {
          // Ignore errors
        }
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
    ...introspectionRoutes,
    {
      src: '/(.*)',
      dest: '/',
    },
  ];

  return { routes, files: rolldownResult.files };
};
