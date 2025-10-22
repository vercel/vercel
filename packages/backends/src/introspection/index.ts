import { BuildV2, Files } from '@vercel/build-utils';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
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
  const cjsLoaderPath = fileURLToPath(
    new URL('loaders/cjs.cjs', import.meta.url)
  );
  const esmLoaderPath = new URL('loaders/esm.js', import.meta.url).href;
  const handlerPath = join(rolldownResult.dir, rolldownResult.handler);

  let introspectionResult: {
    frameworkSlug: string;
    routes: { src: string; dest: string; methods: string[] }[];
  } = {
    frameworkSlug: '',
    routes: [],
  };

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
            frameworkSlug: z.string(),
            routes: z.array(
              z.object({
                src: z.string(),
                dest: z.string(),
                methods: z.array(z.string()),
              })
            ),
          });
          introspectionResult = introspectionSchema.parse(introspection);
        } catch (error) {
          // Ignore errors
        }
      });

      // child.stderr?.on('data', data => {
      //   console.log('[ERROR]', data.toString());
      // });

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
    ...introspectionResult.routes,
    {
      src: '/(.*)',
      dest: '/',
    },
  ];

  let version: string | undefined;
  if (introspectionResult.frameworkSlug) {
    // Resolve to package.json specifically
    const frameworkLibPath = require.resolve(
      `${introspectionResult.frameworkSlug}`,
      {
        paths: [rolldownResult.dir],
      }
    );
    const findNearestPackageJson = (dir: string): string | undefined => {
      const packageJsonPath = join(dir, 'package.json');
      if (existsSync(packageJsonPath)) {
        return packageJsonPath;
      }
      return findNearestPackageJson(dirname(dir));
    };
    const nearestPackageJsonPath = findNearestPackageJson(frameworkLibPath);
    if (nearestPackageJsonPath) {
      const frameworkPackageJson = require(nearestPackageJsonPath);
      version = frameworkPackageJson.version;
    }
  }

  return {
    routes,
    files: rolldownResult.files,
    framework: {
      slug: introspectionResult.frameworkSlug,
      version,
    },
  };
};
