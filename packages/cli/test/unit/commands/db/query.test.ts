import { beforeEach, describe, expect, it, vi } from 'vitest';
import query from '../../../../src/commands/db/query';
import { DB_QUERY_API_PATH } from '../../../../src/commands/db/api';
import * as scope from '../../../../src/util/db/resolve-scope';
import output from '../../../../src/output-manager';

vi.mock('../../../../src/util/db/resolve-scope', () => ({
  resolveDatabaseScope: vi.fn(),
}));
vi.mock('../../../../src/output-manager');
vi.mock('../../../../src/util/output/table', () => ({
  default: vi.fn(() => 'mock table'),
}));

const mockedResolveDatabaseScope = vi.mocked(scope.resolveDatabaseScope);
const mockedOutput = vi.mocked(output);

function createClient() {
  return {
    fetch: vi.fn(),
    input: { confirm: vi.fn() },
    nonInteractive: false,
    stdout: { write: vi.fn() },
  } as any;
}

describe('db query', () => {
  let client: ReturnType<typeof createClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createClient();
    mockedResolveDatabaseScope.mockResolvedValue({
      accountId: 'team_123',
      teamSlug: 'acme',
      projectId: 'prj_123',
      projectName: 'web',
    });
    client.fetch = vi.fn().mockResolvedValue({
      columns: ['id'],
      rows: [{ id: 1 }],
      rowCount: 1,
      durationMs: 12,
      auditId: 'aud_123',
    });
  });

  it('runs queries as readonly against development by default', async () => {
    const exitCode = await query(client, ['select 1']);

    expect(exitCode).toBe(0);
    expect(client.fetch).toHaveBeenCalledWith(DB_QUERY_API_PATH, {
      method: 'POST',
      accountId: 'team_123',
      body: JSON.stringify({
        projectId: 'prj_123',
        environment: 'development',
        resourceIdOrName: undefined,
        role: 'readonly',
        sql: 'select 1',
        reason: undefined,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('passes resource, role, environment, and reason to the Vercel API', async () => {
    const exitCode = await query(client, [
      "insert into audit_log(message) values ('fixed')",
      '--environment',
      'production',
      '--project',
      'web',
      '--resource',
      'neon-main',
      '--role',
      'readwrite',
      '--reason',
      'support ticket 123',
      '--confirm-production-write',
    ]);

    expect(exitCode).toBe(0);
    expect(mockedResolveDatabaseScope).toHaveBeenCalledWith(client, 'web');
    expect(client.fetch).toHaveBeenCalledWith(DB_QUERY_API_PATH, {
      method: 'POST',
      accountId: 'team_123',
      body: JSON.stringify({
        projectId: 'prj_123',
        environment: 'production',
        resourceIdOrName: 'neon-main',
        role: 'readwrite',
        sql: "insert into audit_log(message) values ('fixed')",
        reason: 'support ticket 123',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('refuses production write access in non-interactive mode without confirmation', async () => {
    client.nonInteractive = true;

    const exitCode = await query(client, [
      'delete from users',
      '--environment',
      'production',
      '--role',
      'readwrite',
      '--reason',
      'support ticket 123',
    ]);

    expect(exitCode).toBe(1);
    expect(client.fetch).not.toHaveBeenCalled();
    expect(mockedOutput.error).toHaveBeenCalledWith(
      'Production database write access requires --confirm-production-write in non-interactive mode.'
    );
  });

  it('refuses production write access without a reason', async () => {
    const exitCode = await query(client, [
      'update users set disabled = true',
      '--environment',
      'production',
      '--role',
      'readwrite',
      '--confirm-production-write',
    ]);

    expect(exitCode).toBe(1);
    expect(client.fetch).not.toHaveBeenCalled();
    expect(mockedOutput.error).toHaveBeenCalledWith(
      'Production database write access requires --reason.'
    );
  });

  it('treats production environment checks case-insensitively', async () => {
    client.nonInteractive = true;

    const exitCode = await query(client, [
      'delete from users',
      '--environment',
      'Production',
      '--role',
      'readwrite',
      '--reason',
      'support ticket 123',
    ]);

    expect(exitCode).toBe(1);
    expect(client.fetch).not.toHaveBeenCalled();
    expect(mockedOutput.error).toHaveBeenCalledWith(
      'Production database write access requires --confirm-production-write in non-interactive mode.'
    );
  });

  it('rejects write SQL for readonly queries before calling the API', async () => {
    const exitCode = await query(client, ['delete from users']);

    expect(exitCode).toBe(1);
    expect(client.fetch).not.toHaveBeenCalled();
    expect(mockedResolveDatabaseScope).not.toHaveBeenCalled();
    expect(mockedOutput.error).toHaveBeenCalledWith(
      'Readonly database queries must start with SELECT, SHOW, EXPLAIN, or DESCRIBE.'
    );
  });

  it('rejects SQL payloads larger than the supported limit before calling the API', async () => {
    const exitCode = await query(client, ['select ' + 'x'.repeat(100_001)]);

    expect(exitCode).toBe(1);
    expect(client.fetch).not.toHaveBeenCalled();
    expect(mockedResolveDatabaseScope).not.toHaveBeenCalled();
    expect(mockedOutput.error).toHaveBeenCalledWith(
      'SQL query is too long. Maximum length is 100000 characters.'
    );
  });

  it('does not read database credentials from environment variables', async () => {
    process.env.DATABASE_URL = 'postgres://app-user:secret@example/db';

    const exitCode = await query(client, ['select 1']);

    expect(exitCode).toBe(0);
    expect(JSON.parse((client.fetch as any).mock.calls[0][1].body)).not.toEqual(
      expect.objectContaining({ connectionString: process.env.DATABASE_URL })
    );

    delete process.env.DATABASE_URL;
  });

  it('does not print unexpected provider secrets in json output', async () => {
    client.fetch.mockResolvedValue({
      columns: ['id'],
      rows: [{ id: 1 }],
      rowCount: 1,
      durationMs: 12,
      auditId: 'aud_123',
      connectionString: 'postgres://temporary-secret@example/db',
    });

    const exitCode = await query(client, ['select 1', '--format', 'json']);

    expect(exitCode).toBe(0);
    expect(client.stdout.write).toHaveBeenCalledWith(
      `${JSON.stringify(
        {
          columns: ['id'],
          rows: [{ id: 1 }],
          rowCount: 1,
          durationMs: 12,
          auditId: 'aud_123',
        },
        null,
        2
      )}\n`
    );
    expect(client.stdout.write.mock.calls[0][0]).not.toContain(
      'temporary-secret'
    );
  });

  it('shows a clear message when the database API is unavailable', async () => {
    const err = new Error('Not Found') as Error & { status: number };
    err.status = 404;
    client.fetch = vi.fn().mockRejectedValue(err);

    const exitCode = await query(client, ['select 1']);

    expect(exitCode).toBe(1);
    expect(mockedOutput.error).toHaveBeenCalledWith(
      'Database operations are not available for this account or project yet.'
    );
  });
});
