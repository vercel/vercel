import { BuildV2, glob, debug, Files } from '@vercel/build-utils';
import { isAbsolute, join, normalize, resolve, sep } from 'path';
import { outputFile } from 'fs-extra';
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { rm } from 'fs/promises';
import { createRequire } from 'module';
import { pathToRegexp } from 'path-to-regexp';
import { z } from 'zod';

const require_ = createRequire(__filename);

type RolldownResult = {
  dir: string;
  handler: string;
  files: Files;
};

export const introspectApp = async (
  args: Parameters<BuildV2>[0],
  rolldownResult: RolldownResult
) => {
  const source = expressShimSource(args, rolldownResult);
  const shimPath = join(
    rolldownResult.dir,
    'node_modules',
    'express',
    'index.js'
  );
  await outputFile(shimPath, source);

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
  await rm(join(rolldownResult.dir, 'node_modules'), {
    recursive: true,
    force: true,
  });
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

const invokeFunction = async (
  args: Parameters<BuildV2>[0],
  rolldownResult: RolldownResult
) => {
  await new Promise(resolve => {
    try {
      const child = spawn(
        'node',
        [join(rolldownResult.dir, rolldownResult.handler)],
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

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
      }, 2000);

      child.on('error', err => {
        clearTimeout(timeout);
        debug(`[@vercel/express] Introspection error: ${err.message}`);
        console.log(
          `Unable to extract routes from express, route level observability will not be available`
        );
        resolve(undefined);
      });

      child.on('close', () => {
        clearTimeout(timeout);
        resolve(undefined);
      });
    } catch (error) {
      console.log(
        `Unable to extract routes from express, route level observability will not be available`
      );
      resolve(undefined);
    }
  });
};

const expressShimSource = (
  args: Parameters<BuildV2>[0],
  rolldownResult: RolldownResult
) => {
  const pathToExpress = require_.resolve('express', {
    paths: [args.workPath],
  });
  const introspectionPath = getIntrospectionPath(rolldownResult);
  return `
const fs = require('fs');
const path = require('path');
const originalExpress = require(${JSON.stringify(pathToExpress)});

let app = null
let staticPaths = [];
let views = ''
let viewEngine = ''
const routes = {};
const originalStatic = originalExpress.static
originalExpress.static = (...args) => {
  staticPaths.push(args[0]);
  return originalStatic(...args);
}
function expressWrapper() {
  app = originalExpress.apply(this, arguments);
  // stub the listen method so the process doesn't hang
  app.listen = () => {}
  return app;
}

Object.setPrototypeOf(expressWrapper, originalExpress);
Object.assign(expressWrapper, originalExpress);

expressWrapper.prototype = originalExpress.prototype;

module.exports = expressWrapper;

let routesExtracted = false;

const extractRoutes = () => {
  if (routesExtracted) {
    return;
  }
  routesExtracted = true;

  const methods = ["all", "get", "post", "put", "delete", "patch", "options", "head"]
  if (!app) {
    return;
  }
  const router = app._router || app.router
  for (const route of router.stack) {
    if(route.route) {
      const m = [];
      for (const method of methods) {
        if(route.route.methods[method]) {
          m.push(method.toUpperCase());
        }
      }
      routes[route.route.path] = { methods: m };
    }
  }

  views = app.settings.views
  viewEngine = app.settings['view engine']

  const dir = path.dirname(${JSON.stringify(introspectionPath)});
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(${JSON.stringify(introspectionPath)}, JSON.stringify({routes, views, staticPaths, viewEngine}, null, 2));
}

process.on('exit', () => {
  extractRoutes()
});

process.on('SIGINT', () => {
  extractRoutes()
  process.exit(0);
});

process.on('SIGTERM', () => {
  extractRoutes()
  process.exit(0);
});
  `;
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
