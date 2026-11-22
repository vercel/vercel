import { getTransformedRoutes, type Route } from '@vercel/routing-utils';
import type { VercelConfig } from '../types';

/**
 * The project's routing, as a deployment of the project gets it: its own
 * `routes`, or what its rewrites, redirects, headers, cleanUrls and
 * trailingSlash compile to. The rest of its config stays with the project.
 */
export function projectRoutes(config: VercelConfig): Route[] {
  const { routes, rewrites, redirects, headers, cleanUrls, trailingSlash } =
    config;
  const transformed = getTransformedRoutes({
    routes,
    rewrites,
    redirects,
    headers,
    cleanUrls,
    trailingSlash,
  });
  // DevServer reports an invalid config before anything reaches here.
  if (transformed.error) throw transformed.error;
  return transformed.routes ?? [];
}
