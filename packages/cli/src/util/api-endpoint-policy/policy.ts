import type { Command } from '../../commands/help';

export const HTTP_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
] as const;

const ENDPOINT_RE = new RegExp(`^(${HTTP_METHODS.join('|')}) /\\S*$`);

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
 * Returns `null` when the endpoint declaration is well formed
 * (`"METHOD /path"`), otherwise a description of the problem.
 */
export function validateEndpointFormat(endpoint: string): string | null {
  if (!ENDPOINT_RE.test(endpoint)) {
    return (
      `"${endpoint}" must look like "METHOD /path" where METHOD is one of ` +
      `${HTTP_METHODS.join(', ')} and the path starts with "/"`
    );
  }
  return null;
}

/**
 * Normalizes an endpoint declaration so that declarations and OpenAPI spec
 * entries can be compared: uppercases the method, strips query strings and
 * trailing slashes, and replaces `:param` / `{param}` path segments with
 * `{}`.
 *
 * `"get /v9/projects/:idOrName/"` and `"GET /v9/projects/{id}"` both
 * normalize to `"GET /v9/projects/{}"`.
 */
export function normalizeEndpoint(endpoint: string): string {
  const spaceIdx = endpoint.indexOf(' ');
  const method = endpoint.slice(0, spaceIdx).toUpperCase();
  let path = endpoint.slice(spaceIdx + 1).split('?')[0];
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  const segments = path
    .split('/')
    .map(segment =>
      segment.startsWith(':') || /^\{.*\}$/.test(segment) ? '{}' : segment
    );
  return `${method} ${segments.join('/')}`;
}

/**
 * Whether an endpoint declaration is part of the public OpenAPI spec.
 *
 * @param endpoint - declaration such as `"GET /v9/projects/:idOrName"`
 * @param publicEndpoints - normalized `"METHOD /path"` entries from the
 * public spec (see `public-endpoints.json`)
 */
export function isPublicEndpoint(
  endpoint: string,
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
 *    `endpoints` (an empty array is valid for commands that do not call the
 *    Vercel API).
 * 2. Declared endpoints must be well formed.
 * 3. Any command that declares an endpoint outside the public OpenAPI spec
 *    must be marked `beta: true`.
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
    if (command.endpoints === undefined) {
      if (!options.grandfathered.has(path)) {
        violations.push({
          commandPath: path,
          message:
            `"${path}" must declare the API endpoints it calls via the ` +
            '`endpoints` field on its command definition. Use an empty ' +
            'array if it does not call the Vercel API. See ' +
            'packages/cli/docs/api-endpoint-policy.md',
        });
      }
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
        privateEndpoints.push(endpoint);
      }
    }

    if (privateEndpoints.length > 0 && command.beta !== true) {
      violations.push({
        commandPath: path,
        message:
          `"${path}" calls API endpoints that are not in the public ` +
          `OpenAPI spec (${privateEndpoints.join(', ')}) and must be ` +
          'marked `beta: true` on its command definition, or the ' +
          'endpoints must be moved to the public spec first. If the ' +
          'endpoint was recently made public, refresh the snapshot with ' +
          '`node scripts/update-public-endpoints.mjs`. See ' +
          'packages/cli/docs/api-endpoint-policy.md',
      });
    }
  }

  return violations;
}
