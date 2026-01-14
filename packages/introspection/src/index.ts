import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { dirname, isAbsolute, join, relative } from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import {
  debug,
  isExperimentalBackendsWithoutIntrospectionEnabled,
} from '@vercel/build-utils';

const require = createRequire(import.meta.url);

export const introspectApp = async (args: {
  dir: string;
  handler: string;
  framework: string | null | undefined;
  env: Record<string, string | undefined>;
}) => {
  if (isExperimentalBackendsWithoutIntrospectionEnabled()) {
    return defaultResult(args);
  }
  const cjsLoaderPath = fileURLToPath(
    new URL('loaders/cjs.cjs', import.meta.url)
  );
  const esmLoaderPath = new URL('loaders/esm.mjs', import.meta.url).href;
  const handlerPath = join(args.dir, args.handler);

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
  let introspectionData: z.infer<typeof introspectionSchema> | undefined;

  await new Promise(resolvePromise => {
    try {
      // Use both -r (for CommonJS/require) and --import (for ESM/import)
      debug('Spawning introspection process');
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
        const dataStr = data.toString().trim();
        // Skip empty or non-JSON lines
        if (!dataStr || !dataStr.startsWith('{')) {
          return;
        }
        try {
          debug('Introspection data received', dataStr);
          introspectionData = introspectionSchema.parse(JSON.parse(dataStr));
        } catch (error) {
          debug('Error parsing introspection data', error);
          // Ignore errors - introspection data might be incomplete or malformed
        }
      });

      child.stderr?.on('data', data => {
        const errorMsg = data.toString().trim();
        if (errorMsg) {
          debug('Introspection stderr:', errorMsg);
        }
      });

      const timeout = setTimeout(() => {
        debug('Introspection timeout, killing process with SIGTERM');
        child.kill('SIGTERM');
      }, 8000);
      const timeout2 = setTimeout(() => {
        debug('Introspection timeout, killing process with SIGKILL');
        child.kill('SIGKILL');
      }, 9000);

      child.on('error', err => {
        clearTimeout(timeout);
        clearTimeout(timeout2);
        debug(`Loader error: ${err.message}`);
        resolvePromise(undefined);
      });

      child.on('close', () => {
        clearTimeout(timeout);
        clearTimeout(timeout2);
        debug('Introspection process closed');
        resolvePromise(undefined);
      });
    } catch (error) {
      debug('Introspection error', error);
      resolvePromise(undefined);
    }
  });
  const framework = getFramework(args);
  if (!introspectionData) {
    return defaultResult(args);
  }

  // For now, return empty routes
  const routes = [
    {
      handle: 'filesystem',
    },
    ...introspectionData.routes,
    {
      src: '/(.*)',
      dest: '/',
    },
  ];

  return {
    routes,
    framework,
    additionalFolders: introspectionData.additionalFolders ?? [],
    additionalDeps: introspectionData.additionalDeps ?? [],
  };
};

const defaultResult = (args: {
  dir: string;
  framework: string | null | undefined;
}) => {
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
    framework: getFramework(args),
  };
};

const getFramework = (args: {
  dir: string;
  framework: string | null | undefined;
}) => {
  try {
    let version: string | undefined;
    if (args.framework) {
      // Resolve to package.json specifically
      const frameworkLibPath = require.resolve(`${args.framework}`, {
        paths: [args.dir],
      });
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
      slug: args.framework ?? '',
      version: version ?? '',
    };
  } catch (error) {
    // NestJS actually uses `@nestjs/core` as the package name, but the framework slug is `nestjs`
    debug(
      `Error getting framework for ${args.framework}. Setting framework version to empty string.`,
      error
    );
    return {
      slug: args.framework ?? '',
      version: '',
    };
  }
};
