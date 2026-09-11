import { describe, expect, it, beforeAll } from 'vitest';
import type { Command } from '../../../src/commands/help';
import { commandStructs } from '../../../src/commands';
import {
  evaluatePolicy,
  fetchPublicEndpoints,
  flattenCommands,
  isPublicEndpoint,
  normalizeEndpoint,
  validateEndpointFormat,
} from '../../../src/util/api-endpoint-policy/policy';
import { extractFetchesFromSource } from '../../../src/util/api-endpoint-policy/extract-fetches';
import type { ExtractedFetch } from '../../../src/util/api-endpoint-policy/extract-fetches';
import grandfathered from '../../../src/util/api-endpoint-policy/grandfathered-commands.json';

const GRANDFATHERED = new Set<string>(grandfathered.commands);
let PUBLIC_ENDPOINTS: ReadonlySet<string>;

beforeAll(async () => {
  PUBLIC_ENDPOINTS = await fetchPublicEndpoints();
}, 30_000);

function makeCommand(overrides: Partial<Command> & { name: string }): Command {
  return {
    aliases: [],
    description: 'test command',
    arguments: [],
    options: [],
    examples: [],
    ...overrides,
  };
}

function fetch(
  method: ExtractedFetch['method'],
  path: string,
  file = 'index.ts',
  line = 1
): ExtractedFetch {
  return { method, path, file, line };
}

describe('API endpoint policy (see packages/cli/docs/api-endpoint-policy.md)', () => {
  it('new (non-grandfathered) commands do not call private OpenAPI endpoints', () => {
    const violations = evaluatePolicy(commandStructs, {
      grandfathered: GRANDFATHERED,
      publicEndpoints: PUBLIC_ENDPOINTS,
    });
    const message = violations
      .map(violation => `- ${violation.message}`)
      .join('\n');
    expect(violations, `\n${message}\n`).toEqual([]);
  });

  it('does not let removed commands linger in the grandfathered baseline', () => {
    const existing = new Set(
      flattenCommands(commandStructs).map(flattened => flattened.path)
    );
    // `guidance` is only registered when FF_GUIDANCE_MODE is set, but is
    // intentionally part of the baseline.
    const stale = grandfathered.commands.filter(
      path => !existing.has(path) && !path.startsWith('guidance')
    );
    expect(
      stale,
      'these baseline entries no longer match a command; remove them from grandfathered-commands.json'
    ).toEqual([]);
  });

  describe('endpoint matching helpers', () => {
    it('validates endpoint format', () => {
      expect(
        validateEndpointFormat({
          method: 'GET',
          path: '/v9/projects/:idOrName',
        })
      ).toBeNull();
      expect(
        validateEndpointFormat({ method: 'DELETE', path: '/v1/thing/{id}' })
      ).toBeNull();
      expect(
        validateEndpointFormat({
          method: 'FETCH' as never,
          path: '/v9/projects',
        })
      ).not.toBeNull();
      expect(
        validateEndpointFormat({ method: 'GET', path: 'v9/projects' })
      ).not.toBeNull();
      expect(
        validateEndpointFormat({ method: 'GET', path: '/v9 /projects' })
      ).not.toBeNull();
    });

    it('normalizes parameter syntaxes to a comparable form', () => {
      expect(
        normalizeEndpoint({ method: 'GET', path: '/v9/projects/:idOrName' })
      ).toBe('GET /v9/projects/{}');
      expect(
        normalizeEndpoint({ method: 'GET', path: '/v9/projects/{idOrName}/' })
      ).toBe('GET /v9/projects/{}');
      expect(
        normalizeEndpoint({
          method: 'POST',
          path: '/v13/deployments?forceNew=1',
        })
      ).toBe('POST /v13/deployments');
    });

    it('matches paths against the public spec', () => {
      expect(
        isPublicEndpoint(
          { method: 'GET', path: '/v9/projects/:idOrName' },
          PUBLIC_ENDPOINTS
        )
      ).toBe(true);
      expect(
        isPublicEndpoint({ method: 'GET', path: '/v2/user' }, PUBLIC_ENDPOINTS)
      ).toBe(true);
      expect(
        isPublicEndpoint(
          { method: 'GET', path: '/v1/oauth-apps/installations' },
          PUBLIC_ENDPOINTS
        )
      ).toBe(false);
    });
  });

  describe('evaluatePolicy', () => {
    const emptyBaseline = new Set<string>();

    it('rejects private fetch call sites on new commands', () => {
      const violations = evaluatePolicy([makeCommand({ name: 'apps' })], {
        grandfathered: emptyBaseline,
        publicEndpoints: PUBLIC_ENDPOINTS,
        extractFetches: () => [
          fetch('GET', '/v1/oauth-apps/installations', 'apps/index.ts', 10),
        ],
      });
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain('not in the public OpenAPI spec');
      expect(violations[0].message).toContain(
        'GET /v1/oauth-apps/installations'
      );
    });

    it('accepts public fetch call sites on new commands', () => {
      const violations = evaluatePolicy([makeCommand({ name: 'projects' })], {
        grandfathered: emptyBaseline,
        publicEndpoints: PUBLIC_ENDPOINTS,
        extractFetches: () => [fetch('GET', '/v9/projects/:idOrName')],
      });
      expect(violations).toEqual([]);
    });

    it('skips grandfathered commands even if they call private endpoints', () => {
      const violations = evaluatePolicy(
        [makeCommand({ name: 'old-command' })],
        {
          grandfathered: new Set(['old-command']),
          publicEndpoints: PUBLIC_ENDPOINTS,
          extractFetches: () => [fetch('GET', '/v1/oauth-apps/installations')],
        }
      );
      expect(violations).toEqual([]);
    });

    it('checks new subcommands even when the parent is grandfathered', () => {
      const violations = evaluatePolicy(
        [
          makeCommand({
            name: 'old-command',
            subcommands: [makeCommand({ name: 'new-subcommand' })],
          }),
        ],
        {
          grandfathered: new Set(['old-command']),
          publicEndpoints: PUBLIC_ENDPOINTS,
          extractFetches: commandPath =>
            commandPath === 'old-command new-subcommand'
              ? [fetch('GET', '/v1/oauth-apps/installations')]
              : [],
        }
      );
      expect(violations).toHaveLength(1);
      expect(violations[0].commandPath).toBe('old-command new-subcommand');
    });

    it('skips parent router commands that only have subcommands', () => {
      const violations = evaluatePolicy(
        [
          makeCommand({
            name: 'parent',
            subcommands: [
              makeCommand({
                name: 'child',
              }),
            ],
          }),
        ],
        {
          grandfathered: emptyBaseline,
          publicEndpoints: PUBLIC_ENDPOINTS,
          extractFetches: commandPath =>
            commandPath === 'parent'
              ? [fetch('GET', '/v1/oauth-apps/installations')]
              : [fetch('GET', '/v2/user')],
        }
      );
      expect(violations).toEqual([]);
    });

    it('treats commands with no resolvable fetches as compliant', () => {
      const violations = evaluatePolicy([makeCommand({ name: 'local-only' })], {
        grandfathered: emptyBaseline,
        publicEndpoints: PUBLIC_ENDPOINTS,
        extractFetches: () => [],
      });
      expect(violations).toEqual([]);
    });
  });
});

describe('client.fetch call-site extraction', () => {
  it('extracts method and path from literal and template fetch calls', () => {
    const source = `
      async function run(client: { fetch: Function }) {
        await client.fetch('/v2/user');
        await client.fetch(\`/v9/projects/\${id}/link\`, { method: 'POST' });
        await client.fetch('/v1/thing/' + id, { method: 'DELETE' });
      }
    `;
    const fetches = extractFetchesFromSource('example.ts', source);
    expect(fetches).toEqual([
      expect.objectContaining({ method: 'GET', path: '/v2/user', line: 3 }),
      expect.objectContaining({
        method: 'POST',
        path: '/v9/projects/{}/link',
        line: 4,
      }),
    ]);
  });

  it('resolves local url bindings and ignores query-only interpolations', () => {
    const source = `
      async function run(client: { fetch: Function }, query: string) {
        const url = \`/v1/connect/connectors\${query ? \`?\${query}\` : ''}\`;
        await client.fetch(url);
        await client.fetch(\`/v9/projects/\${id}\`);
      }
    `;
    const fetches = extractFetchesFromSource('example.ts', source);
    expect(fetches).toEqual([
      expect.objectContaining({
        method: 'GET',
        path: '/v1/connect/connectors',
      }),
      expect.objectContaining({
        method: 'GET',
        path: '/v9/projects/{}',
      }),
    ]);
  });

  it('resolves base + fragment templates and concatenation', () => {
    const source = `
      async function run(client: { fetch: Function }, id: string, backupId: string) {
        const base = \`/v1/edge-config/\${encodeURIComponent(id)}\`;
        await client.fetch(\`\${base}/token\`, { method: 'POST' });
        await client.fetch(\`\${base}/tokens\`);
        await client.fetch(\`\${base}/tokens\`, { method: 'DELETE' });

        const backups = \`/v1/edge-config/\${id}/backups\`;
        await client.fetch(\`\${backups}/\${backupId}\`);
        await client.fetch(\`\${backups}/\${backupId}/restore\`, { method: 'POST' });

        const prefix = '/v1/edge-config/{}';
        await client.fetch(prefix + '/token', { method: 'POST' });
      }
    `;
    const fetches = extractFetchesFromSource('edge-config.ts', source);
    expect(fetches).toEqual([
      expect.objectContaining({
        method: 'POST',
        path: '/v1/edge-config/{}/token',
      }),
      expect.objectContaining({
        method: 'GET',
        path: '/v1/edge-config/{}/tokens',
      }),
      expect.objectContaining({
        method: 'DELETE',
        path: '/v1/edge-config/{}/tokens',
      }),
      expect.objectContaining({
        method: 'GET',
        path: '/v1/edge-config/{}/backups/{}',
      }),
      expect.objectContaining({
        method: 'POST',
        path: '/v1/edge-config/{}/backups/{}/restore',
      }),
      expect.objectContaining({
        method: 'POST',
        path: '/v1/edge-config/{}/token',
      }),
    ]);
  });
});
