import { BuildV2 } from '@vercel/build-utils';
import { join } from 'path';
import { outputFile } from 'fs-extra';
import { readFileSync } from 'fs';
import { rm } from 'fs/promises';
import { spawn } from 'child_process';
import { pathToRegexp } from 'path-to-regexp';
import { rolldown } from './rolldown';
import { z } from 'zod';

export const introspectApp = async (
  args: Parameters<BuildV2>[0],
  options: Awaited<ReturnType<typeof rolldown>>
) => {
  // Inject route capture into the bundled JavaScript
  await injectRouteCapture(options);

  // Invoke the function to extract routes at runtime
  await invokeFunction(args, options);

  // Process the introspection results
  const {
    routes: routesFromIntrospection,
    views,
    staticPaths,
    viewEngine,
  } = await processIntrospection(options);

  // Clean up temporary files
  await cleanup(options);

  console.log(
    `Generated introspection.json with ${routesFromIntrospection.length} routes for observability`
  );

  return { routes: routesFromIntrospection, views, staticPaths, viewEngine };
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
        (value: Record<string, { methods: string[] }>) =>
          Object.entries(value)
            .map(([path, route]) => convertHonoRoute(path, route))
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
    const introspectionPath = join(options.outputDir, 'introspection.json');
    const introspection = readFileSync(introspectionPath, 'utf8');
    const parsedData = JSON.parse(introspection);
    console.log('Parsed introspection data:', Object.keys(parsedData));
    console.log('Routes count:', Object.keys(parsedData.routes || {}).length);
    return schema.parse(parsedData);
  } catch (error) {
    console.log('Schema validation error:', error);
    console.log(
      `Unable to extract routes from hono, route level observability will not be available`
    );
    return {
      routes: [],
      views: undefined,
      staticPaths: undefined,
      viewEngine: undefined,
    };
  }
};

const getIntrospectionPath = (options: { outputDir: string }) => {
  return join(options.outputDir, 'introspection.json');
};

const cleanup = async (options: Awaited<ReturnType<typeof rolldown>>) => {
  await rm(join(options.outputDir, 'node_modules'), {
    recursive: true,
    force: true,
  });
  await rm(getIntrospectionPath(options), { force: true });
};

const invokeFunction = async (
  args: Parameters<BuildV2>[0],
  options: Awaited<ReturnType<typeof rolldown>>
) => {
  await new Promise(resolve => {
    try {
      const child = spawn('node', [join(options.outputDir, options.handler)], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: options.outputDir,
        env: {
          ...process.env,
          ...(args.meta?.env || {}),
          ...(args.meta?.buildEnv || {}),
        },
      });

      setTimeout(() => {
        child.kill('SIGTERM');
      }, 5000);

      child.on('error', () => {
        console.log(
          `Unable to extract routes from hono, route level observability will not be available`
        );
        resolve(undefined);
      });

      child.on('close', () => {
        resolve(undefined);
      });
    } catch (error) {
      console.log(
        `Unable to extract routes from hono, route level observability will not be available`
      );
      resolve(undefined);
    }
  });
};

const injectRouteCapture = async (
  options: Awaited<ReturnType<typeof rolldown>>
) => {
  const bundlePath = join(options.outputDir, options.handler);
  const introspectionPath = getIntrospectionPath(options);

  try {
    let bundleContent = readFileSync(bundlePath, 'utf8');

    // Add route capture code at the beginning of the bundle
    const routeCaptureCode = `
// Route capture for introspection using Hono's built-in methods
import fs from 'fs';
import path from 'path';
const routes = {};
let routesExtracted = false;

// Function to extract routes using Hono's built-in app.routes
function extractRoutesFromApp(app) {
  if (!app || !app.routes) {
    return;
  }
  
  // Use Hono's built-in routes property
  for (const route of app.routes) {
    const routePath = route.path;
    const method = route.method.toUpperCase();
    
    if (!routes[routePath]) {
      routes[routePath] = { methods: [] };
    }
    if (!routes[routePath].methods.includes(method)) {
      routes[routePath].methods.push(method);
    }
  }
}

// Handle app.all() routes - they should include all HTTP methods
const processAllRoutes = () => {
  for (const [path, routeData] of Object.entries(routes)) {
    if (routeData.methods.includes('ALL')) {
      routeData.methods = [
        'GET',
        'POST',
        'PUT',
        'DELETE',
        'PATCH',
        'OPTIONS',
        'HEAD',
      ];
    }
  }
};

const extractRoutes = () => {
  if (routesExtracted) {
    return;
  }
  routesExtracted = true;

  // Extract routes from all Hono instances
  if (typeof app !== 'undefined') {
    extractRoutesFromApp(app);
  }
  
  // Also check for other common variable names
  const commonNames = ['api', 'router', 'server', 'hono', 'honoApp'];
  for (const name of commonNames) {
    if (typeof globalThis[name] !== 'undefined') {
      extractRoutesFromApp(globalThis[name]);
    }
  }

  processAllRoutes();

  // Ensure directory exists
  const dir = path.dirname('${introspectionPath}');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync('${introspectionPath}', JSON.stringify({
    routes,
    views: undefined,
    staticPaths: undefined,
    viewEngine: undefined
  }, null, 2));
};

process.on('exit', () => {
  extractRoutes();
});

process.on('SIGINT', () => {
  extractRoutes();
  process.exit(0);
});

process.on('SIGTERM', () => {
  extractRoutes();
  process.exit(0);
});

`;

    // Inject the route capture code after the imports
    const importEndIndex = bundleContent.indexOf('//#region index.js');
    if (importEndIndex !== -1) {
      bundleContent =
        bundleContent.slice(0, importEndIndex) +
        routeCaptureCode +
        bundleContent.slice(importEndIndex);
    } else {
      // Fallback: inject at the beginning
      bundleContent = routeCaptureCode + bundleContent;
    }

    // Write the modified bundle back
    await outputFile(bundlePath, bundleContent);

    console.log('Injected route capture into bundled JavaScript');
  } catch (error) {
    console.log('Failed to inject route capture:', error);
    throw error;
  }
};

const convertHonoRoute = (route: string, routeData: { methods: string[] }) => {
  try {
    const { regexp } = pathToRegexp(route);

    const dest = route;
    const src = regexp.source;

    return {
      src,
      dest: dest,
      methods: routeData.methods,
    };
  } catch (error) {
    console.log(`Skipping route with invalid path: ${route}`);
    // For routes that can't be parsed by path-to-regexp, create a simple regex
    const escapedRoute = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
      src: `^${escapedRoute}$`,
      dest: route,
      methods: routeData.methods,
    };
  }
};
