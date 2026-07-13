import type { Command, CommandEndpoint, HttpMethod } from '../../commands/help';
import { OPENAPI_URL, FETCH_TIMEOUT_MS } from '../openapi/constants';

export const HTTP_METHODS: ReadonlyArray<HttpMethod> = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
];

export interface FlattenedCommand {
  /** Space separated command path, e.g. `"deploy-hooks create"` */
  readonly path: string;
  readonly command: Command;
}

/**
 * Flattens a command tree (command + nested subcommands) into a list of
 * `"command subcommand ..."` paths.
 */
export function flattenCommands(
  commands: ReadonlyArray<Command>,
  parentPath = ''
): FlattenedCommand[] {
  const out: FlattenedCommand[] = [];
  for (const command of commands) {
    const path = parentPath ? `${parentPath} ${command.name}` : command.name;
    out.push({ path, command });
    if (command.subcommands) {
      out.push(...flattenCommands(command.subcommands, path));
    }
  }
  return out;
}

/**
 * Formats an endpoint declaration for error messages.
 */
export function formatEndpoint(endpoint: CommandEndpoint): string {
  return `${endpoint.method} ${endpoint.path}`;
}

/**
 * Returns `null` when the endpoint declaration is well formed, otherwise a
 * description of the problem. Guards against malformed declarations sneaking
 * past the type system (e.g. from `as const` casts or untyped literals).
 */
export function validateEndpointFormat(
  endpoint: CommandEndpoint
): string | null {
  if (!HTTP_METHODS.includes(endpoint.method)) {
    return (
      `"${formatEndpoint(endpoint)}" has method "${endpoint.method}"; ` +
      `expected one of ${HTTP_METHODS.join(', ')}`
    );
  }
  if (!/^\/\S*$/.test(endpoint.path)) {
    return (
      `"${formatEndpoint(endpoint)}" has an invalid path; it must start ` +
      'with "/" and contain no whitespace'
    );
  }
  return null;
}

/**
 * Normalizes an endpoint so that declarations and OpenAPI spec entries can
 * be compared: strips query strings and trailing slashes, and replaces
 * `:param` / `{param}` path segments with `{}`.
 *
 * `/v9/projects/:idOrName/` and `/v9/projects/{id}` both normalize to
 * `"GET /v9/projects/{}"` (for a GET endpoint).
 */
export function normalizeEndpoint(endpoint: CommandEndpoint): string {
  let path = endpoint.path.split('?')[0];
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  const segments = path
    .split('/')
    .map(segment =>
      segment.startsWith(':') || segment === '{}' || /^\{.*\}$/.test(segment)
        ? '{}'
        : segment
    );
  return `${endpoint.method.toUpperCase()} ${segments.join('/')}`;
}

/**
 * Fetches the public Vercel OpenAPI spec and returns its operations as
 * normalized `"METHOD /path"` entries.
 *
 * Throws when the spec cannot be fetched or contains no operations, so the
 * policy check fails loudly instead of silently treating every endpoint as
 * private (or public).
 */
export async function fetchPublicEndpoints(
  specUrl: string = OPENAPI_URL
): Promise<Set<string>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let spec: { paths?: Record<string, Record<string, unknown>> };
  try {
    const response = await fetch(specUrl, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch the public OpenAPI spec from ${specUrl}: HTTP ${response.status}`
      );
    }
    spec = (await response.json()) as {
      paths?: Record<string, Record<string, unknown>>;
    };
  } finally {
    clearTimeout(timeoutId);
  }

  const methodsByLowercase = new Map<string, HttpMethod>(
    HTTP_METHODS.map(method => [method.toLowerCase(), method])
  );
  const endpoints = new Set<string>();
  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const key of Object.keys(pathItem)) {
      const method = methodsByLowercase.get(key);
      if (method) {
        endpoints.add(normalizeEndpoint({ method, path }));
      }
    }
  }

  if (endpoints.size === 0) {
    throw new Error(
      `The public OpenAPI spec from ${specUrl} contains no operations`
    );
  }
  return endpoints;
}

/**
 * Whether an endpoint declaration is part of the public OpenAPI spec.
 *
 * @param endpoint - declaration such as
 * `{ method: 'GET', path: '/v9/projects/:idOrName' }`
 * @param publicEndpoints - normalized `"METHOD /path"` entries from the
 * public spec (see `fetchPublicEndpoints`)
 */
export function isPublicEndpoint(
  endpoint: CommandEndpoint,
  publicEndpoints: ReadonlySet<string>
): boolean {
  return publicEndpoints.has(normalizeEndpoint(endpoint));
}

export interface PolicyViolation {
  readonly commandPath: string;
  readonly message: string;
}

/**
 * Evaluates the API endpoint policy over a command tree:
 *
 * 1. Commands and subcommands that are not grandfathered must declare
 *    `endpoints`, and the list must not be empty — an empty list would
 *    bypass the policy. Parent commands that only route to subcommands may
 *    omit the field; their subcommands are checked individually.
 * 2. Declared endpoints must be well formed.
 * 3. Any command that declares an endpoint outside the public OpenAPI spec
 *    must be marked `beta: true`.
 *
 * Fetch call-site coverage (declared endpoints must match `client.fetch`
 * usage) is enforced separately by `evaluateEndpointCoverage`.
 */
export function evaluatePolicy(
  commands: ReadonlyArray<Command>,
  options: {
    grandfathered: ReadonlySet<string>;
    publicEndpoints: ReadonlySet<string>;
  }
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  for (const { path, command } of flattenCommands(commands)) {
    const isRouter = (command.subcommands?.length ?? 0) > 0;

    if (command.endpoints === undefined) {
      if (!options.grandfathered.has(path) && !isRouter) {
        violations.push({
          commandPath: path,
          message:
            `"${path}" must declare the API endpoints it calls via the ` +
            '`endpoints` field on its command definition. See ' +
            'packages/cli/docs/api-endpoint-policy.md',
        });
      }
      continue;
    }

    if (command.endpoints.length === 0) {
      violations.push({
        commandPath: path,
        message:
          `"${path}" declares an empty \`endpoints\` list, which would ` +
          'bypass the API endpoint policy. Declare the endpoints the ' +
          'command actually calls. See ' +
          'packages/cli/docs/api-endpoint-policy.md',
      });
      continue;
    }

    const privateEndpoints: string[] = [];
    for (const endpoint of command.endpoints) {
      const formatError = validateEndpointFormat(endpoint);
      if (formatError) {
        violations.push({
          commandPath: path,
          message: `"${path}" has a malformed endpoint declaration: ${formatError}`,
        });
        continue;
      }
      if (!isPublicEndpoint(endpoint, options.publicEndpoints)) {
        privateEndpoints.push(formatEndpoint(endpoint));
      }
    }

    if (privateEndpoints.length > 0 && command.beta !== true) {
      violations.push({
        commandPath: path,
        message:
          `"${path}" calls API endpoints that are not in the public ` +
          `OpenAPI spec (${privateEndpoints.join(', ')}) and must be ` +
          'marked `beta: true` on its command definition, or the ' +
          'endpoints must be moved to the public spec first. See ' +
          'packages/cli/docs/api-endpoint-policy.md',
      });
    }
  }

  return violations;
}
