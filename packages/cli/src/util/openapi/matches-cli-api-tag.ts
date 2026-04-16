import { OpenApiCache } from './openapi-cache';

/**
 * Returns true when `tagHint` matches an OpenAPI tag on at least one endpoint.
 * Used by the root CLI to route `vercel <tag> …` to the `api` command without
 * requiring the `api` token.
 *
 * When operations carry `x-vercel-cli.supportedSubcommands`, this should only
 * match tags that have at least one opted-in operation (see OpenAPI extraction).
 */
export async function matchesCliApiTag(tagHint: string): Promise<boolean> {
  if (!tagHint || tagHint.startsWith('-') || tagHint.includes('/')) {
    return false;
  }

  const cache = new OpenApiCache();
  const loaded = await cache.load();
  if (!loaded) {
    return false;
  }

  const endpoints = cache.getEndpoints();
  const lower = tagHint.toLowerCase();
  return endpoints.some(ep => ep.tags.some(t => t.toLowerCase() === lower));
}

/**
 * OpenAPI tag string to use when routing `vercel project[s] …` to `vercel api …`.
 * Prefer `projects` (common in the public spec); fall back to `project` if present.
 */
export async function resolveOpenApiTagForProjectsCli(): Promise<
  string | null
> {
  if (await matchesCliApiTag('projects')) {
    return 'projects';
  }
  if (await matchesCliApiTag('project')) {
    return 'project';
  }
  return null;
}

/**
 * OpenAPI tag string to use when routing `vercel team[s] …` to the API fallback.
 */
export async function resolveOpenApiTagForTeamsCli(): Promise<string | null> {
  if (await matchesCliApiTag('teams')) {
    return 'teams';
  }
  if (await matchesCliApiTag('team')) {
    return 'team';
  }
  return null;
}
