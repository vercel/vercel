import type { Command, CommandEndpoint, HttpMethod } from '../../commands/help';
import { OPENAPI_URL, FETCH_TIMEOUT_MS } from '../openapi/constants';
import {
  extractCommandFetches,
  type ExtractCommandFetches,
} from './endpoint-coverage';

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
 * description of the problem.
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
 * Normalizes an endpoint so that fetch call sites and OpenAPI spec entries
 * can be compared: strips query strings and trailing slashes, and replaces
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
 * Whether an endpoint is part of the public OpenAPI spec.
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

export interface EvaluatePolicyOptions {
  readonly grandfathered: ReadonlySet<string>;
  readonly publicEndpoints: ReadonlySet<string>;
  /** Absolute path to `packages/cli/src`. */
  readonly cliSrcRoot?: string;
  /**
   * Override for tests. Defaults to statically extracting `client.fetch`
   * call sites from the command's implementation files.
   */
  readonly extractFetches?: ExtractCommandFetches;
}

/**
 * Evaluates the API endpoint policy over a command tree (CI-only).
 *
 * For each non-grandfathered leaf command/subcommand, statically extract
 * resolvable `client.fetch` call sites and fail when any are outside the
 * public OpenAPI spec. Parent commands that only route to subcommands are
 * skipped; their children are checked individually.
 *
 * There is no runtime warning and no `endpoints` / `beta` markup on command
 * definitions — prefer publicizing the API (or landing a dedicated CLI
 * OpenAPI/SDK) over shipping new private call sites.
 */
export function evaluatePolicy(
  commands: ReadonlyArray<Command>,
  options: EvaluatePolicyOptions
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  const extract =
    options.extractFetches ??
    ((commandPath, command) =>
      extractCommandFetches(commandPath, command, {
        cliSrcRoot: options.cliSrcRoot,
      }));

  for (const { path, command } of flattenCommands(commands)) {
    if (options.grandfathered.has(path)) {
      continue;
    }

    const isRouter = (command.subcommands?.length ?? 0) > 0;
    if (isRouter) {
      continue;
    }

    const fetches = extract(path, command);
    const privateEndpoints = new Map<string, string>();
    for (const fetch of fetches) {
      const endpoint = { method: fetch.method, path: fetch.path };
      if (isPublicEndpoint(endpoint, options.publicEndpoints)) {
        continue;
      }
      const key = normalizeEndpoint(endpoint);
      if (!privateEndpoints.has(key)) {
        privateEndpoints.set(
          key,
          `${formatEndpoint(endpoint)} (${fetch.file}:${fetch.line})`
        );
      }
    }

    if (privateEndpoints.size > 0) {
      violations.push({
        commandPath: path,
        message:
          `"${path}" calls API endpoints that are not in the public ` +
          `OpenAPI spec (${[...privateEndpoints.values()].join(', ')}). ` +
          'Move the endpoints to the public spec before adding this ' +
          'command, or discuss an exception with CLI maintainers. See ' +
          'packages/cli/docs/api-endpoint-policy.md',
      });
    }
  }

  return violations;
}
