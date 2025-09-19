import { BuildV2, glob } from '@vercel/build-utils';
import { join } from 'path';
import { outputFile } from 'fs-extra';
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { rm } from 'fs/promises';
import { createRequire } from 'module';
import { pathToRegexp } from 'path-to-regexp';
import { rolldown } from './rolldown';
import { z } from 'zod/v4';

const require_ = createRequire(__filename);

export const introspectApp = async (
  args: Parameters<BuildV2>[0],
  options: Awaited<ReturnType<typeof rolldown>>
) => {
  const source = expressShimSource(options);
  await outputFile(
    join(options.outputDir, 'node_modules', 'express', 'index.js'),
    source
  );

  await invokeFunction(args, options);
  const { routes, views, staticPaths } = await processIntrospection(options);
  await cleanup(options);

  if (views) {
    const viewFiles = await glob(join(views, '**/*'), args.workPath);
    for (const [p, f] of Object.entries(viewFiles)) {
      options.files[p] = f;
    }
  }

  if (staticPaths) {
    for (const staticPath of staticPaths) {
      const staticFiles = await glob(join(staticPath, '**/*'), args.workPath);
      for (const [p, f] of Object.entries(staticFiles)) {
        options.files[p] = f;
      }
    }
  }

  return { routes };
};

const cleanup = async (options: Awaited<ReturnType<typeof rolldown>>) => {
  await rm(join(options.outputDir, 'node_modules'), {
    recursive: true,
    force: true,
  });
  await rm(join(options.outputDir, 'introspection.json'));
};

const processIntrospection = async (
  options: Awaited<ReturnType<typeof rolldown>>
) => {
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
  const introspectionPath = join(options.outputDir, 'introspection.json');
  const introspection = readFileSync(introspectionPath, 'utf8');
  return schema.parse(JSON.parse(introspection));
};

const invokeFunction = async (
  args: Parameters<BuildV2>[0],
  options: Awaited<ReturnType<typeof rolldown>>
) => {
  await new Promise(resolve => {
    const child = spawn('node', [join(options.outputDir, options.handler)], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: options.outputDir,
      env: {
        ...process.env,
        ...(args.meta?.env || {}),
        ...(args.meta?.buildEnv || {}),
      },
    });

    child.stderr.on('data', data => {
      console.error(`stderr: ${data}`);
    });

    // Kill after 1 second
    setTimeout(() => {
      child.kill('SIGTERM');
    }, 1000);

    // Wait for child to complete
    child.on('close', () => {
      resolve(undefined);
    });
  });
};

const expressShimSource = (args: { outputDir: string }) => {
  const pathToExpress = require_.resolve('express');
  return `
const fs = require('fs');
const originalExpress = require('${pathToExpress}');

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
  return app;
}

// Copy all properties from the original express to the wrapper
Object.setPrototypeOf(expressWrapper, originalExpress);
Object.assign(expressWrapper, originalExpress);

// Preserve the original prototype
expressWrapper.prototype = originalExpress.prototype;

module.exports = expressWrapper;

const extractRoutes = () => {
  const methods = ["all", "get", "post", "put", "delete", "patch", "options", "head"]
  for (const route of app._router.stack) {
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
  fs.writeFileSync('${args.outputDir}/introspection.json', JSON.stringify({routes, views, staticPaths, viewEngine}, null, 2));
}

process.on('exit', () => {
  extractRoutes()
});

process.on('SIGINT', () => {
  extractRoutes()
  process.exit(0);
});
// Write routes to file on SIGTERM
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
