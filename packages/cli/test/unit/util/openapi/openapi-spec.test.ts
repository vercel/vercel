import { describe, expect, it, beforeAll } from 'vitest';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { OpenApiCache } from '../../../../src/util/openapi/openapi-cache';
import { resolveEndpointByTagAndOperationId } from '../../../../src/util/openapi/resolve-by-tag-operation';
import {
  renderCard,
  renderTable,
  parseArrayColumns,
} from '../../../../src/commands/api/display-columns';
import type {
  OpenApiSpec,
  EndpointInfo,
} from '../../../../src/util/openapi/types';

const FIXTURE_PATH = join(
  __dirname,
  '../../../fixtures/unit/openapi-spec.json'
);

function createCacheFromSpec(spec: OpenApiSpec): OpenApiCache {
  const cache = new OpenApiCache();
  // Inject the spec directly to avoid filesystem/network
  (cache as unknown as { spec: OpenApiSpec }).spec = spec;
  return cache;
}

function getXVercelCli(
  spec: OpenApiSpec,
  path: string,
  method: string
): Record<string, unknown> | undefined {
  const pathItem = spec.paths[path];
  if (!pathItem) return undefined;
  const operation = pathItem[method as keyof typeof pathItem] as
    | Record<string, unknown>
    | undefined;
  return operation?.['x-vercel-cli'] as Record<string, unknown> | undefined;
}

describe('OpenAPI spec fixture', () => {
  let spec: OpenApiSpec;
  let cache: OpenApiCache;
  let endpoints: EndpointInfo[];

  beforeAll(async () => {
    const raw = await readFile(FIXTURE_PATH, 'utf-8');
    spec = JSON.parse(raw) as OpenApiSpec;
    cache = createCacheFromSpec(spec);
    endpoints = cache.getEndpoints();
  });

  describe('spec validity', () => {
    it('is a valid OpenAPI 3.x spec', () => {
      expect(spec.openapi).toMatch(/^3\./);
      expect(spec.paths).toBeDefined();
      expect(Object.keys(spec.paths).length).toBeGreaterThan(100);
    });
  });

  describe('x-vercel-cli.supportedSubcommands', () => {
    it('getAuthUser is opted in', () => {
      const cli = getXVercelCli(spec, '/v2/user', 'get');
      expect(cli).toBeDefined();
      expect(cli!.supportedSubcommands).toBe(true);
    });

    it('getTeam is opted in', () => {
      const cli = getXVercelCli(spec, '/v2/teams/{teamId}', 'get');
      expect(cli).toBeDefined();
      expect(cli!.supportedSubcommands).toBe(true);
    });

    it('getTeams is opted in', () => {
      const cli = getXVercelCli(spec, '/v2/teams', 'get');
      expect(cli).toBeDefined();
      expect(cli!.supportedSubcommands).toBe(true);
    });

    it('getProject is opted in', () => {
      const cli = getXVercelCli(spec, '/v9/projects/{idOrName}', 'get');
      expect(cli).toBeDefined();
      expect(cli!.supportedSubcommands).toBe(true);
    });

    it('non-opted-in operations do not have the flag', () => {
      const cli = getXVercelCli(spec, '/v2/teams/{teamId}', 'delete');
      expect(cli?.supportedSubcommands).toBeFalsy();
    });

    it('finds all opted-in operations', () => {
      let count = 0;
      for (const [, pathItem] of Object.entries(spec.paths)) {
        for (const method of [
          'get',
          'post',
          'put',
          'patch',
          'delete',
        ] as const) {
          const op = pathItem[method] as Record<string, unknown> | undefined;
          const cli = op?.['x-vercel-cli'] as
            | Record<string, unknown>
            | undefined;
          if (cli?.supportedSubcommands) count++;
        }
      }
      expect(count).toBeGreaterThanOrEqual(10);
    });
  });

  describe('x-vercel-cli.aliases', () => {
    it('getTeam has alias "get"', () => {
      const cli = getXVercelCli(spec, '/v2/teams/{teamId}', 'get');
      expect(cli!.aliases).toEqual(['get']);
    });

    it('getTeams has alias "list"', () => {
      const cli = getXVercelCli(spec, '/v2/teams', 'get');
      expect(cli!.aliases).toEqual(['list']);
    });

    it('readAccessGroup has aliases "read" and "get"', () => {
      const cli = getXVercelCli(spec, '/v1/access-groups/{idOrName}', 'get');
      expect(cli!.aliases).toEqual(['read', 'get']);
    });

    it('getAuthUser has no aliases', () => {
      const cli = getXVercelCli(spec, '/v2/user', 'get');
      expect(cli!.aliases).toBeUndefined();
    });
  });

  describe('displayColumns extraction via OpenApiCache', () => {
    it('extracts displayColumns for getAuthUser', () => {
      const ep = endpoints.find(e => e.operationId === 'getAuthUser')!;
      expect(ep).toBeDefined();

      const columns = cache.getDisplayColumns(ep);
      expect(columns).not.toBeNull();
      expect(columns).toHaveProperty('name', 'user.name');
      expect(columns).toHaveProperty('id', 'user.id');
      expect(columns).toHaveProperty('email', 'user.email');
      expect(columns).toHaveProperty('username', 'user.username');
    });

    it('returns null for operations without displayColumns', () => {
      const ep = endpoints.find(e => e.operationId === 'getTeam')!;
      expect(ep).toBeDefined();

      const columns = cache.getDisplayColumns(ep);
      expect(columns).toBeNull();
    });
  });

  describe('tag + operationId resolution against real spec', () => {
    it('resolves getAuthUser under "user" tag', () => {
      const result = resolveEndpointByTagAndOperationId(
        endpoints,
        'user',
        'getAuthUser'
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.endpoint.operationId).toBe('getAuthUser');
        expect(result.endpoint.method).toBe('GET');
      }
    });

    it('resolves getTeam under "teams" tag', () => {
      const result = resolveEndpointByTagAndOperationId(
        endpoints,
        'teams',
        'getTeam'
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.endpoint.operationId).toBe('getTeam');
        expect(result.endpoint.path).toContain('teams');
      }
    });

    it('resolves getTeams under "teams" tag', () => {
      const result = resolveEndpointByTagAndOperationId(
        endpoints,
        'teams',
        'getTeams'
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.endpoint.operationId).toBe('getTeams');
      }
    });

    it('does not resolve across tag boundaries', () => {
      const result = resolveEndpointByTagAndOperationId(
        endpoints,
        'teams',
        'getAuthUser'
      );
      expect(result.ok).toBe(false);
    });

    it('resolves case-insensitively', () => {
      const result = resolveEndpointByTagAndOperationId(
        endpoints,
        'Teams',
        'getteam'
      );
      expect(result.ok).toBe(true);
    });
  });
});

describe('display-columns', () => {
  describe('parseArrayColumns', () => {
    it('extracts array and row-level paths from [] notation', () => {
      const data = {
        teams: [
          { name: 'Acme', id: 't1', slug: 'acme' },
          { name: 'Beta', id: 't2', slug: 'beta' },
        ],
        pagination: { count: 2 },
      };
      const columns = {
        name: 'teams[].name',
        id: 'teams[].id',
        slug: 'teams[].slug',
      };

      const result = parseArrayColumns(data, columns);
      expect(result).not.toBeNull();
      expect(result!.rows).toHaveLength(2);
      expect(result!.rows[0]).toEqual({ name: 'Acme', id: 't1', slug: 'acme' });
      expect(result!.rowColumns).toEqual({
        name: 'name',
        id: 'id',
        slug: 'slug',
      });
    });

    it('handles nested dot paths after []', () => {
      const data = {
        members: [{ username: 'alice', joinedFrom: { origin: 'invite' } }],
      };
      const columns = {
        username: 'members[].username',
        joinedFrom: 'members[].joinedFrom.origin',
      };

      const result = parseArrayColumns(data, columns);
      expect(result).not.toBeNull();
      expect(result!.rowColumns).toEqual({
        username: 'username',
        joinedFrom: 'joinedFrom.origin',
      });
    });

    it('returns null for plain dot-notation (no [])', () => {
      const columns = {
        name: 'user.name',
        id: 'user.id',
      };
      const result = parseArrayColumns({}, columns);
      expect(result).toBeNull();
    });

    it('returns null if the array key does not resolve to an array', () => {
      const data = { teams: 'not-an-array' };
      const columns = { name: 'teams[].name' };

      const result = parseArrayColumns(data, columns);
      expect(result).toBeNull();
    });

    it('returns null when columns have inconsistent prefixes', () => {
      const columns = {
        name: 'teams[].name',
        email: 'members[].email',
      };
      const result = parseArrayColumns({}, columns);
      expect(result).toBeNull();
    });
  });

  describe('renderCard', () => {
    it('renders a key-value card with dot-notation paths', () => {
      const data = {
        user: {
          name: 'Jeff',
          id: 'uid_123',
          email: 'jeff@example.com',
        },
      };
      const columns = {
        name: 'user.name',
        id: 'user.id',
        email: 'user.email',
      };

      const output = renderCard(data, columns);
      expect(output).toContain('Jeff');
      expect(output).toContain('uid_123');
      expect(output).toContain('jeff@example.com');
    });

    it('shows dash for missing values', () => {
      const data = { user: { name: 'Jeff' } };
      const columns = {
        name: 'user.name',
        missing: 'user.nonexistent',
      };

      const output = renderCard(data, columns);
      expect(output).toContain('Jeff');
      expect(output).toContain('–');
    });
  });

  describe('renderTable', () => {
    it('renders rows with headers', () => {
      const rows = [
        { name: 'Acme', slug: 'acme' },
        { name: 'Beta', slug: 'beta' },
      ];
      const columns = {
        name: 'name',
        slug: 'slug',
      };

      const output = renderTable(rows, columns);
      const lines = output.split('\n');
      expect(lines.length).toBe(3);
      expect(lines[1]).toContain('Acme');
      expect(lines[1]).toContain('acme');
      expect(lines[2]).toContain('Beta');
    });

    it('handles nested paths in table rows', () => {
      const rows = [
        { username: 'alice', joinedFrom: { origin: 'invite' } },
        { username: 'bob', joinedFrom: { origin: 'link' } },
      ];
      const columns = {
        username: 'username',
        source: 'joinedFrom.origin',
      };

      const output = renderTable(rows, columns);
      expect(output).toContain('invite');
      expect(output).toContain('link');
    });

    it('formats epoch timestamps as ISO dates', () => {
      const rows = [{ name: 'Acme', createdAt: 1700000000000 }];
      const columns = { name: 'name', createdAt: 'createdAt' };

      const output = renderTable(rows, columns);
      expect(output).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('parseArrayColumns + renderTable integration', () => {
    it('renders a teams-style API response as a table', () => {
      const apiResponse = {
        teams: [
          {
            name: 'Acme Corp',
            id: 'team_abc',
            slug: 'acme',
            membership: { role: 'OWNER' },
            createdAt: 1700000000000,
          },
          {
            name: 'Beta Inc',
            id: 'team_def',
            slug: 'beta',
            membership: { role: 'MEMBER' },
            createdAt: 1700100000000,
          },
        ],
        pagination: { count: 2, next: null },
      };

      const columns = {
        name: 'teams[].name',
        id: 'teams[].id',
        slug: 'teams[].slug',
        role: 'teams[].membership.role',
        createdAt: 'teams[].createdAt',
      };

      const parsed = parseArrayColumns(apiResponse, columns);
      expect(parsed).not.toBeNull();

      const output = renderTable(parsed!.rows, parsed!.rowColumns);
      const lines = output.split('\n');
      expect(lines.length).toBe(3);
      expect(lines[0]).toContain('name');
      expect(lines[0]).toContain('role');
      expect(lines[1]).toContain('Acme Corp');
      expect(lines[1]).toContain('OWNER');
      expect(lines[2]).toContain('Beta Inc');
      expect(lines[2]).toContain('MEMBER');
    });

    it('renders a members-style API response as a table', () => {
      const apiResponse = {
        members: [
          {
            username: 'alice',
            email: 'alice@example.com',
            role: 'ADMIN',
            joinedFrom: { origin: 'invite' },
            createdAt: 1700000000000,
          },
        ],
      };

      const columns = {
        username: 'members[].username',
        email: 'members[].email',
        role: 'members[].role',
        joinedFrom: 'members[].joinedFrom.origin',
        createdAt: 'members[].createdAt',
      };

      const parsed = parseArrayColumns(apiResponse, columns);
      expect(parsed).not.toBeNull();

      const output = renderTable(parsed!.rows, parsed!.rowColumns);
      expect(output).toContain('alice');
      expect(output).toContain('alice@example.com');
      expect(output).toContain('invite');
    });
  });
});
