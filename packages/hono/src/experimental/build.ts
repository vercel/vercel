export const version = 2;
import { BuildV2, Lambda } from '@vercel/build-utils';
import { downloadInstallAndBundle, maybeExecBuildCommand } from './utils';
import { rolldown } from './rolldown';
import { entrypointCallback } from './find-entrypoint';
import { introspectApp } from './introspection';

export const build: BuildV2 = async args => {
  console.log(`Using experimental hono build`);
  const downloadResult = await downloadInstallAndBundle(args);

  await maybeExecBuildCommand(args, downloadResult);

  args.entrypoint = await entrypointCallback(args);

  const rolldownResult = await rolldown(args);

  // Generate introspection.json and get routes for observability
  const { routes } = await introspectApp(args, rolldownResult);

  const lambda = new Lambda({
    runtime: downloadResult.nodeVersion.runtime,
    ...rolldownResult,
  });

  // Create multiple function outputs for observability
  const output: Record<string, Lambda> = { index: lambda };
  const usedPaths = new Set<string>();

  for (const route of routes) {
    if (route.dest) {
      if (route.dest === '/') {
        continue;
      }

      // Normalize path to avoid conflicts
      const normalizedPath = route.dest.replace(/\/$/, '');

      // Skip if we've already used this path
      if (!usedPaths.has(normalizedPath)) {
        output[route.dest] = lambda;
        usedPaths.add(normalizedPath);
      }
    }
  }

  // Create a routes array that includes filesystem handling, introspection routes, and catch-all
  const mainRoutes = [
    {
      handle: 'filesystem',
    },
    ...routes,
    {
      src: '/(.*)',
      dest: '/',
    },
  ];

  return {
    routes: mainRoutes,
    output,
  };
};
