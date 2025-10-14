import { BuildV2, glob, debug, Files } from '@vercel/build-utils';
import { isAbsolute, join, normalize, resolve, sep, dirname } from 'path';
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { rm } from 'fs/promises';
import { pathToRegexp } from 'path-to-regexp';
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
  debug('[@vercel/express] Running app to extract routes...');
  await invokeFunction(args, rolldownResult);

  const {
    routes: routesFromIntrospection,
    views,
    staticPaths,
  } = await processIntrospection(rolldownResult);
  debug(
    `[@vercel/express] Extracted ${routesFromIntrospection.length} routes from introspection`
  );

  await cleanupShim(rolldownResult);

  if (views) {
    try {
      debug(`[@vercel/express] Collecting view files from: ${views}`);
      const validatedViews = validatePath(views, args.workPath);
      const viewFiles = await glob(join(validatedViews, '**/*'), args.workPath);
      debug(
        `[@vercel/express] Found ${Object.keys(viewFiles).length} view files`
      );
      for (const [p, f] of Object.entries(viewFiles)) {
        rolldownResult.files[p] = f;
      }
    } catch (error) {
      console.log(`Skipping invalid views path: ${views}`);
    }
  }

  if (staticPaths && staticPaths.length > 0) {
    try {
      debug(
        `[@vercel/express] Collecting static files from: ${staticPaths.join(', ')}`
      );
      const validatedStaticPaths = staticPaths.map(path =>
        validatePath(path, args.workPath)
      );
      let totalStaticFiles = 0;
      for (const staticPath of validatedStaticPaths) {
        const staticFiles = await glob(join(staticPath, '**/*'), args.workPath);
        totalStaticFiles += Object.keys(staticFiles).length;
        for (const [p, f] of Object.entries(staticFiles)) {
          rolldownResult.files[p] = f;
        }
      }
      debug(`[@vercel/express] Found ${totalStaticFiles} static files`);
    } catch (error) {
      console.log(`Skipping invalid static paths: ${staticPaths}`);
    }
  }

  const routes = [
    {
      handle: 'filesystem',
    },
    ...routesFromIntrospection,
    {
      src: '/(.*)',
      dest: '/',
    },
  ];

  return { routes };
};

const cleanupShim = async (rolldownResult: RolldownResult) => {
  // return;
  await rm(getIntrospectionPath(rolldownResult), { force: true });
};

const processIntrospection = async (rolldownResult: RolldownResult) => {
  const schema = z.object({
    routes: z
      .record(
        z.string(),
        z.object({
          methods: z.array(z.string()),
        })
      )
      .transform(
        value =>
          Object.entries(value)
            .map(([path, route]) => convertExpressRoute(path, route))
            .filter(Boolean) as {
            src: string;
            dest: string;
            methods: string[];
          }[]
      ),
    views: z.string().optional(),
    staticPaths: z.array(z.string()).optional(),
    viewEngine: z.string().optional(),
  });
  try {
    const introspectionPath = getIntrospectionPath(rolldownResult);
    const introspection = readFileSync(introspectionPath, 'utf8');
    return schema.parse(JSON.parse(introspection));
  } catch (error) {
    console.log(
      `Unable to extract routes from express, route level observability will not be available`
    );
    return {
      routes: [],
      views: undefined,
      staticPaths: undefined,
      viewEngine: undefined,
    };
  }
};

const getIntrospectionPath = (options: { dir: string }) => {
  return join(options.dir, 'introspection.json');
};

const getPackageRoot = () => {
  // Find the package.json to get the package root
  try {
    const packageJsonPath = require.resolve('@vercel/backends/package.json');
    return dirname(packageJsonPath);
  } catch {
    // Fallback: check if we're in src (dev) or dist (bundled)
    if (__dirname.includes('/src/')) {
      // In dev: src/introspection -> ../../ -> package root
      return resolve(join(__dirname, '..', '..'));
    } else {
      // After bundle: dist -> ../ -> package root
      return resolve(join(__dirname, '..'));
    }
  }
};

const invokeFunction = async (
  args: Parameters<BuildV2>[0],
  rolldownResult: RolldownResult
) => {
  const packageRoot = getPackageRoot();
  const loaderPath = resolve(join(packageRoot, 'express-loader.js'));
  const handlerPath = join(rolldownResult.dir, rolldownResult.handler);

  await new Promise(resolvePromise => {
    try {
      // CommonJS loader detects Express by properties, works for both CJS and ESM
      const child = spawn('node', ['-r', loaderPath, handlerPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: rolldownResult.dir,
        env: {
          ...process.env,
          ...(args.meta?.env || {}),
          ...(args.meta?.buildEnv || {}),
          VERCEL_EXPRESS_INTROSPECTION_PATH:
            getIntrospectionPath(rolldownResult),
        },
      });

      child.stdout?.on('data', data => {
        console.log('[CHILD STDOUT]', data.toString());
      });

      child.stderr?.on('data', data => {
        console.log('[CHILD STDERR]', data.toString());
      });

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
      }, 2000);

      child.on('error', err => {
        clearTimeout(timeout);
        debug(`[@vercel/express] Introspection error: ${err.message}`);
        console.log(
          `Unable to extract routes from express, route level observability will not be available`
        );
        resolvePromise(undefined);
      });

      child.on('close', () => {
        clearTimeout(timeout);
        resolvePromise(undefined);
      });
    } catch (error) {
      console.log(
        `Unable to extract routes from express, route level observability will not be available`
      );
      resolvePromise(undefined);
    }
  });
};

const convertExpressRoute = (
  route: string,
  routeData: { methods: string[] }
) => {
  const { regexp } = pathToRegexp(route);

  const dest = route;
  if (dest === '/') {
    return;
  }

  const src = regexp.source;

  return {
    src,
    dest: dest,
    methods: routeData.methods,
  };
};

const validatePath = (inputPath: string, workPath: string): string => {
  // Reject null bytes
  if (inputPath.indexOf('\0') !== -1) {
    throw new Error(`Path contains null bytes: ${inputPath}`);
  }

  // Normalize the path to resolve any . and .. components
  const normalizedPath = normalize(inputPath);

  // Check for directory traversal attempts after normalization
  if (normalizedPath.includes('..')) {
    throw new Error(
      `Path contains directory traversal sequences: ${inputPath}`
    );
  }

  // Reject absolute paths (they should be relative to workPath)
  if (isAbsolute(normalizedPath)) {
    throw new Error(`Absolute paths are not allowed: ${inputPath}`);
  }

  // Resolve the final path and ensure it stays within workPath
  const resolvedPath = resolve(workPath, normalizedPath);
  const resolvedWorkPath = resolve(workPath);

  if (
    !resolvedPath.startsWith(resolvedWorkPath + sep) &&
    resolvedPath !== resolvedWorkPath
  ) {
    throw new Error(`Path escapes the intended directory: ${inputPath}`);
  }

  return normalizedPath;
};
