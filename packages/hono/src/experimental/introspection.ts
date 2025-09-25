import { BuildV2 } from '@vercel/build-utils';
import { join } from 'path';
import { outputFile } from 'fs-extra';
import { readFileSync } from 'fs';
import { rm } from 'fs/promises';
import { pathToRegexp } from 'path-to-regexp';
import { rolldown } from './rolldown';
import { z } from 'zod';

export const introspectApp = async (
  _args: Parameters<BuildV2>[0],
  options: Awaited<ReturnType<typeof rolldown>>
) => {
  // Parse routes from the bundled JavaScript file
  const routes = await parseRoutesFromBundle(options);

  // Create introspection.json with the parsed routes for observability
  const introspectionData = {
    routes,
    views: undefined,
    staticPaths: undefined,
    viewEngine: undefined,
  };

  const introspectionPath = getIntrospectionPath(options);
  await outputFile(
    introspectionPath,
    JSON.stringify(introspectionData, null, 2)
  );

  // Process the routes to convert them to Vercel format
  const {
    routes: routesFromIntrospection,
    views,
    staticPaths,
    viewEngine,
  } = await processIntrospection(options);

  // Clean up temporary files
  await cleanup(options);

  console.log(
    `Generated introspection.json with ${Object.keys(routes).length} routes for observability`
  );

  return { routes: routesFromIntrospection, views, staticPaths, viewEngine };
};

const parseRoutesFromBundle = async (
  options: Awaited<ReturnType<typeof rolldown>>
) => {
  const bundlePath = join(options.outputDir, options.handler);

  try {
    const bundleContent = readFileSync(bundlePath, 'utf8');
    const routes: Record<string, { methods: string[] }> = {};

    // Parse app.get(), app.post(), etc. calls
    const methodPatterns = [
      { method: 'GET', pattern: /app\.get\(["']([^"']+)["']/g },
      { method: 'POST', pattern: /app\.post\(["']([^"']+)["']/g },
      { method: 'PUT', pattern: /app\.put\(["']([^"']+)["']/g },
      { method: 'DELETE', pattern: /app\.delete\(["']([^"']+)["']/g },
      { method: 'PATCH', pattern: /app\.patch\(["']([^"']+)["']/g },
      { method: 'OPTIONS', pattern: /app\.options\(["']([^"']+)["']/g },
      { method: 'HEAD', pattern: /app\.head\(["']([^"']+)["']/g },
      { method: 'ALL', pattern: /app\.all\(["']([^"']+)["']/g },
    ];

    for (const { method, pattern } of methodPatterns) {
      let match;
      while ((match = pattern.exec(bundleContent)) !== null) {
        const path = match[1];
        if (!routes[path]) {
          routes[path] = { methods: [] };
        }
        if (!routes[path].methods.includes(method)) {
          routes[path].methods.push(method);
        }
      }
    }

    // Handle app.all() routes - they should include all HTTP methods
    for (const [, routeData] of Object.entries(routes)) {
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

    console.log(`Parsed ${Object.keys(routes).length} routes from bundle`);
    return routes;
  } catch (error) {
    console.log('Failed to parse routes from bundle:', error);
    return {};
  }
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
  await rm(getIntrospectionPath(options), { force: true });
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
