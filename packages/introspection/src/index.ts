import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { dirname, isAbsolute, join, relative } from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const require = createRequire(import.meta.url);

export const introspectApp = async (args: {
  dir: string;
  handler: string;
  env: Record<string, string | undefined>;
}) => {
  const cjsLoaderPath = fileURLToPath(
    new URL('loaders/cjs.cjs', import.meta.url)
  );
  const esmLoaderPath = new URL('loaders/esm.mjs', import.meta.url).href;
  const handlerPath = join(args.dir, args.handler);

  let introspectionData: string | null = null;
  const introspectionSchema = z.object({
    frameworkSlug: z.string().optional(),
    routes: z.array(
      z.object({
        src: z.string(),
        dest: z.string(),
        methods: z.array(z.string()),
      })
    ),
    additionalFolders: z
      .array(z.string())
      .optional()
      .transform(values => {
        // if is absolute, make relative to dir
        return values?.map(val => {
          if (isAbsolute(val)) {
            return relative(args.dir, val);
          }
          // else, assume relative to dir
          return val;
        });
      }),
    additionalDeps: z.array(z.string()).optional(),
  });

  await new Promise(resolvePromise => {
    try {
      // Use both -r (for CommonJS/require) and --import (for ESM/import)
      const child = spawn(
        'node',
        ['-r', cjsLoaderPath, '--import', esmLoaderPath, handlerPath],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
          // stdio: 'inherit',
          cwd: args.dir,
          env: {
            ...process.env,
            ...args.env,
          },
        }
      );

      child.stdout?.on('data', data => {
        try {
          introspectionData = data.toString();
        } catch (error) {
          // Ignore errors
        }
      });

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
      }, 2000);
      const timeout2 = setTimeout(() => {
        child.kill('SIGKILL');
      }, 3000);

      child.on('error', err => {
        clearTimeout(timeout);
        clearTimeout(timeout2);
        console.log(`Loader error: ${err.message}`);
        resolvePromise(undefined);
      });

      child.on('close', () => {
        clearTimeout(timeout);
        clearTimeout(timeout2);
        resolvePromise(undefined);
      });
    } catch (error) {
      resolvePromise(undefined);
    }
  });
  const introspectionResult = introspectionSchema.safeParse(
    JSON.parse(introspectionData || '{}')
  );
  if (!introspectionResult.success) {
    return {
      routes: [
        {
          handle: 'filesystem',
        },
        {
          src: '/(.*)',
          dest: '/',
        },
      ],
      framework: {
        slug: '',
        version: '',
      },
    };
  }

  // For now, return empty routes
  const routes = [
    {
      handle: 'filesystem',
    },
    ...introspectionResult.data.routes,
    {
      src: '/(.*)',
      dest: '/',
    },
  ];

  let version: string | undefined;
  if (introspectionResult.data.frameworkSlug) {
    // Resolve to package.json specifically
    const frameworkLibPath = require.resolve(
      `${introspectionResult.data.frameworkSlug}`,
      {
        paths: [args.dir],
      }
    );
    const findNearestPackageJson = (dir: string): string | undefined => {
      const packageJsonPath = join(dir, 'package.json');
      if (existsSync(packageJsonPath)) {
        return packageJsonPath;
      }
      const parentDir = dirname(dir);
      if (parentDir === dir) {
        return undefined;
      }
      return findNearestPackageJson(parentDir);
    };
    const nearestPackageJsonPath = findNearestPackageJson(frameworkLibPath);
    if (nearestPackageJsonPath) {
      const frameworkPackageJson = require(nearestPackageJsonPath);
      version = frameworkPackageJson.version;
    }
  }

  return {
    routes,
    framework: {
      slug: introspectionResult.data.frameworkSlug,
      version,
    },
    additionalFolders: introspectionResult.data.additionalFolders ?? [],
    additionalDeps: introspectionResult.data.additionalDeps ?? [],
  };
};
