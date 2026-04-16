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
 * Resolve a CLI command name (e.g. `alias`, `project`, `teams`) to its
 * OpenAPI tag, trying the exact name, with trailing 's' appended, and
 * with trailing 's' stripped.  Returns `null` when no tag matches.
 */
export async function resolveOpenApiTagForCommand(
  command: string
): Promise<string | null> {
  if (await matchesCliApiTag(command)) return command;
  if (await matchesCliApiTag(command + 's')) return command + 's';
  if (command.endsWith('s') && (await matchesCliApiTag(command.slice(0, -1))))
    return command.slice(0, -1);
  return null;
}

export const resolveOpenApiTagForProjectsCli = () =>
  resolveOpenApiTagForCommand('project');

export const resolveOpenApiTagForTeamsCli = () =>
  resolveOpenApiTagForCommand('teams');
