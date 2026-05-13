import { beforeEach, describe, expect, it, vi } from 'vitest';
import query from '../../../../src/commands/db/query';
import shell from '../../../../src/commands/db/shell';
import {
  DB_QUERY_API_PATH,
  DB_SESSIONS_API_PATH,
} from '../../../../src/commands/db/api';
import * as scope from '../../../../src/util/db/resolve-scope';
import output from '../../../../src/output-manager';

vi.mock('../../../../src/util/db/resolve-scope', () => ({
  resolveDatabaseScope: vi.fn(),
}));
vi.mock('../../../../src/output-manager');

const mockedResolveDatabaseScope = vi.mocked(scope.resolveDatabaseScope);

function createContractClient(
  routes: Record<
    string,
    (request: { accountId?: string; body?: unknown }) => unknown
  >
) {
  let stdout = '';
  return {
    fetch: vi.fn((url: string, opts: any = {}) => {
      const handler = routes[`${opts.method ?? 'GET'} ${url}`];
      if (!handler) {
        throw new Error(
          `Unexpected API request: ${opts.method ?? 'GET'} ${url}`
        );
      }
      return Promise.resolve(
        handler({
          accountId: opts.accountId,
          body: opts.body ? JSON.parse(opts.body) : undefined,
        })
      );
    }),
    input: { confirm: vi.fn() },
    nonInteractive: false,
    stdout: {
      write: vi.fn((chunk: string) => {
        stdout += chunk;
      }),
      getFullOutput: () => stdout,
    },
  } as any;
}

describe('db API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedResolveDatabaseScope.mockResolvedValue({
      accountId: 'team_123',
      teamSlug: 'acme',
      projectId: 'prj_123',
      projectName: 'web',
    });
  });

  it('sends a least-privilege query request to the Vercel DB query API', async () => {
    const bodies: unknown[] = [];
    const client = createContractClient({
      [`POST ${DB_QUERY_API_PATH}`]: request => {
        expect(request.accountId).toBe('team_123');
        bodies.push(request.body);
        return {
          columns: ['id'],
          rows: [{ id: 1 }],
          rowCount: 1,
          auditId: 'aud_123',
        };
      },
    });

    const exitCode = await query(client, [
      'select id from users limit 1',
      '--resource',
      'store_neon_main',
      '--format',
      'json',
    ]);

    expect(exitCode).toBe(0);
    expect(bodies).toEqual([
      {
        projectId: 'prj_123',
        environment: 'development',
        resourceIdOrName: 'store_neon_main',
        role: 'readonly',
        sql: 'select id from users limit 1',
      },
    ]);
    expect(client.stdout.getFullOutput()).toContain('aud_123');
  });

  it('omits provider command details from shell JSON output even when API returns them', async () => {
    const client = createContractClient({
      [`POST ${DB_SESSIONS_API_PATH}`]: request => {
        expect(request.accountId).toBe('team_123');
        expect(request.body).toEqual({
          projectId: 'prj_123',
          environment: 'development',
          role: 'readonly',
          ttl: '10m',
        });
        return {
          sessionId: 'dbsess_123',
          expiresAt: '2026-05-08T12:15:00.000Z',
          auditId: 'aud_123',
          connectionString: 'postgres://temporary-secret@example/db',
          command: {
            executable: 'psql',
            args: ['postgres://temporary-secret@example/db'],
            env: { PGPASSWORD: 'temporary-secret' },
          },
        };
      },
    });

    const exitCode = await shell(client, ['--ttl', '10m', '--format', 'json']);

    expect(exitCode).toBe(0);
    expect(client.stdout.getFullOutput()).toBe(
      `${JSON.stringify(
        {
          sessionId: 'dbsess_123',
          expiresAt: '2026-05-08T12:15:00.000Z',
          auditId: 'aud_123',
        },
        null,
        2
      )}\n`
    );
    expect(client.stdout.getFullOutput()).not.toContain('temporary-secret');
    expect(output.error).not.toHaveBeenCalled();
  });
});
