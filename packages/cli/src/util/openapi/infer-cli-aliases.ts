import type { EndpointInfo } from './types';

/**
 * Infer standard CLI subcommand aliases from an endpoint's HTTP method and path parameters.
 *
 * Maps REST semantics to familiar CLI verbs so that `vercel api <tag> ls` works the
 * same as `vercel <tag> ls`:
 *
 *   GET  (no path params) → ls, list
 *   GET  (with path params) → inspect, get
 *   POST → add, create
 *   DELETE → rm, remove
 *   PUT / PATCH → update
 *
 * These are used for resolution only and do NOT override display names
 * (which come from explicit `x-vercel-cli.aliases` or the `operationId`).
 */
export function inferCliSubcommandAliases(ep: EndpointInfo): string[] {
  const upper = ep.method.toUpperCase();
  const hasPathParams = ep.parameters.some(p => p.in === 'path');

  switch (upper) {
    case 'GET':
      return hasPathParams ? ['inspect', 'get'] : ['ls', 'list'];
    case 'POST':
      return ['add', 'create'];
    case 'DELETE':
      return ['rm', 'remove'];
    case 'PUT':
    case 'PATCH':
      return ['update'];
    default:
      return [];
  }
}
