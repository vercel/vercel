import {
  describe,
  expect,
  it,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from 'vitest';
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
import {
  evaluateEndpointCoverage,
  coverageGap,
} from '../../../src/util/api-endpoint-policy/endpoint-coverage';
import { extractFetchesFromSource } from '../../../src/util/api-endpoint-policy/extract-fetches';
import {
  findBetaCommandPath,
  maybePrintBetaWarning,
  printBetaWarning,
} from '../../../src/util/api-endpoint-policy/beta-warning';
import grandfathered from '../../../src/util/api-endpoint-policy/grandfathered-commands.json';
import output from '../../../src/output-manager';

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
  } as Command;
}

describe('API endpoint policy (see packages/cli/docs/api-endpoint-policy.md)', () => {
  it('every command and subcommand declares its API endpoints, and commands using private endpoints are marked beta', () => {
    const violations = [
      ...evaluatePolicy(commandStructs, {
        grandfathered: GRANDFATHERED,
        publicEndpoints: PUBLIC_ENDPOINTS,
      }),
      ...evaluateEndpointCoverage(commandStructs),
    ];
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

  describe('endpoint declarations', () => {
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

    it('matches declarations against the public spec', () => {
      // stable, long-public endpoints
      expect(
        isPublicEndpoint(
          { method: 'GET', path: '/v9/projects/:idOrName' },
          PUBLIC_ENDPOINTS
        )
      ).toBe(true);
      expect(
        isPublicEndpoint({ method: 'GET', path: '/v2/user' }, PUBLIC_ENDPOINTS)
      ).toBe(true);
      // never-public endpoint
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

    it('requires new commands to declare endpoints', () => {
      const violations = evaluatePolicy(
        [makeCommand({ name: 'new-command' })],
        { grandfathered: emptyBaseline, publicEndpoints: PUBLIC_ENDPOINTS }
      );
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain('must declare the API endpoints');
    });

    it('requires new subcommands to declare endpoints even when the parent is grandfathered', () => {
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
        }
      );
      expect(violations).toHaveLength(1);
      expect(violations[0].commandPath).toBe('old-command new-subcommand');
    });

    it('rejects an empty endpoints list', () => {
      const violations = evaluatePolicy(
        [makeCommand({ name: 'sneaky', endpoints: [] })],
        { grandfathered: emptyBaseline, publicEndpoints: PUBLIC_ENDPOINTS }
      );
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain(
        'empty `endpoints` list, which would bypass'
      );
    });

    it('rejects an empty endpoints list even on grandfathered commands', () => {
      const violations = evaluatePolicy(
        [makeCommand({ name: 'sneaky', endpoints: [] })],
        {
          grandfathered: new Set(['sneaky']),
          publicEndpoints: PUBLIC_ENDPOINTS,
        }
      );
      expect(violations).toHaveLength(1);
    });

    it('lets parent commands that only route to subcommands omit endpoints', () => {
      const violations = evaluatePolicy(
        [
          makeCommand({
            name: 'parent',
            subcommands: [
              makeCommand({
                name: 'child',
                endpoints: [{ method: 'GET', path: '/v9/projects/:idOrName' }],
              }),
            ],
          }),
        ],
        { grandfathered: emptyBaseline, publicEndpoints: PUBLIC_ENDPOINTS }
      );
      expect(violations).toEqual([]);
    });

    it('rejects private endpoints on commands not marked beta', () => {
      const violations = evaluatePolicy(
        [
          makeCommand({
            name: 'apps',
            endpoints: [
              { method: 'GET', path: '/v1/oauth-apps/installations' },
            ],
          }),
        ],
        { grandfathered: emptyBaseline, publicEndpoints: PUBLIC_ENDPOINTS }
      );
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain('must be marked `beta: true`');
    });

    it('accepts private endpoints on commands marked beta', () => {
      const violations = evaluatePolicy(
        [
          makeCommand({
            name: 'apps',
            beta: true,
            endpoints: [
              { method: 'GET', path: '/v1/oauth-apps/installations' },
            ],
          }),
        ],
        { grandfathered: emptyBaseline, publicEndpoints: PUBLIC_ENDPOINTS }
      );
      expect(violations).toEqual([]);
    });

    it('accepts public endpoints without a beta marker', () => {
      const violations = evaluatePolicy(
        [
          makeCommand({
            name: 'projects',
            endpoints: [{ method: 'GET', path: '/v9/projects/:idOrName' }],
          }),
        ],
        { grandfathered: emptyBaseline, publicEndpoints: PUBLIC_ENDPOINTS }
      );
      expect(violations).toEqual([]);
    });

    it('rejects malformed endpoint declarations', () => {
      const violations = evaluatePolicy(
        [
          makeCommand({
            name: 'bad',
            endpoints: [{ method: 'GET', path: 'v9/projects' }],
          }),
        ],
        { grandfathered: emptyBaseline, publicEndpoints: PUBLIC_ENDPOINTS }
      );
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain('malformed endpoint declaration');
    });
  });
});

describe('beta command warning', () => {
  let printSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    printSpy = vi.spyOn(output, 'print').mockImplementation(() => {});
  });

  afterEach(() => {
    printSpy.mockRestore();
  });

  it('prints a warning naming the command', () => {
    printBetaWarning('vercel apps install');
    expect(printSpy).toHaveBeenCalledTimes(1);
    const message = String(printSpy.mock.calls[0][0]);
    expect(message).toContain('vercel apps install');
    expect(message).toContain('beta command');
  });

  it('does not warn for non-beta commands', () => {
    maybePrintBetaWarning('whoami', []);
    expect(printSpy).not.toHaveBeenCalled();
  });

  it('does not warn for unknown commands', () => {
    maybePrintBetaWarning('does-not-exist', []);
    expect(printSpy).not.toHaveBeenCalled();
  });

  describe('findBetaCommandPath', () => {
    const registry = new Map<string, Command>([
      [
        'apps',
        makeCommand({
          name: 'apps',
          subcommands: [
            makeCommand({ name: 'list' }),
            makeCommand({
              name: 'install',
              aliases: ['add'],
              beta: true,
            }),
            makeCommand({
              name: 'tokens',
              subcommands: [makeCommand({ name: 'revoke', beta: true })],
            }),
          ],
        }),
      ],
      ['all-beta', makeCommand({ name: 'all-beta', beta: true })],
    ]);

    it('resolves a beta top-level command', () => {
      expect(findBetaCommandPath(registry, 'all-beta', ['anything'])).toBe(
        'vercel all-beta'
      );
    });

    it('resolves a beta subcommand, including via alias', () => {
      expect(findBetaCommandPath(registry, 'apps', ['install'])).toBe(
        'vercel apps install'
      );
      expect(findBetaCommandPath(registry, 'apps', ['add'])).toBe(
        'vercel apps install'
      );
    });

    it('resolves nested beta subcommands', () => {
      expect(findBetaCommandPath(registry, 'apps', ['tokens', 'revoke'])).toBe(
        'vercel apps tokens revoke'
      );
    });

    it('returns null for non-beta invocations', () => {
      expect(findBetaCommandPath(registry, 'apps', ['list'])).toBeNull();
      expect(findBetaCommandPath(registry, 'apps', [])).toBeNull();
      expect(findBetaCommandPath(registry, 'missing', [])).toBeNull();
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

  it('flags undeclared fetch call sites as coverage gaps', () => {
    const missing = coverageGap(
      [{ method: 'GET', path: '/v2/user' }],
      [
        {
          method: 'GET',
          path: '/v2/user',
          file: 'a.ts',
          line: 1,
        },
        {
          method: 'POST',
          path: '/v1/oauth-apps/installations',
          file: 'a.ts',
          line: 2,
        },
      ]
    );
    expect(missing).toHaveLength(1);
    expect(missing[0].path).toBe('/v1/oauth-apps/installations');
  });

  it('does not report a gap when declaration uses :param and call uses interpolation', () => {
    const missing = coverageGap(
      [{ method: 'POST', path: '/v2/projects/:idOrName/deploy-hooks' }],
      [
        {
          method: 'POST',
          path: '/v2/projects/{}/deploy-hooks',
          file: 'create.ts',
          line: 10,
        },
      ]
    );
    expect(missing).toEqual([]);
  });
});
