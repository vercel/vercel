import { beforeEach, describe, expect, it, vi } from 'vitest';
import shell from '../../../../src/commands/db/shell';
import { DB_SESSIONS_API_PATH } from '../../../../src/commands/db/api';
import * as scope from '../../../../src/util/db/resolve-scope';
import output from '../../../../src/output-manager';

const { mockSpawn } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: mockSpawn,
}));

vi.mock('../../../../src/util/db/resolve-scope', () => ({
  resolveDatabaseScope: vi.fn(),
}));
vi.mock('../../../../src/output-manager');

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

describe('db shell', () => {
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
      sessionId: 'dbsess_123',
      expiresAt: '2026-05-08T12:15:00.000Z',
      auditId: 'aud_123',
    });
    mockSpawn.mockReturnValue({
      on: vi.fn((_event, callback) => {
        if (_event === 'close') callback(0);
        return undefined;
      }),
    });
  });

  it('creates a readonly development session by default', async () => {
    const exitCode = await shell(client, []);

    expect(exitCode).toBe(0);
    expect(client.fetch).toHaveBeenCalledWith(DB_SESSIONS_API_PATH, {
      method: 'POST',
      accountId: 'team_123',
      body: JSON.stringify({
        projectId: 'prj_123',
        environment: 'development',
        resourceIdOrName: undefined,
        role: 'readonly',
        ttl: undefined,
        reason: undefined,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('passes ttl, resource, role, environment, and reason to session creation', async () => {
    const exitCode = await shell(client, [
      '--environment',
      'production',
      '--project',
      'web',
      '--resource',
      'supabase-main',
      '--role',
      'readonly',
      '--ttl',
      '10m',
      '--reason',
      'investigate production issue',
    ]);

    expect(exitCode).toBe(0);
    expect(mockedResolveDatabaseScope).toHaveBeenCalledWith(client, 'web');
    expect(client.fetch).toHaveBeenCalledWith(DB_SESSIONS_API_PATH, {
      method: 'POST',
      accountId: 'team_123',
      body: JSON.stringify({
        projectId: 'prj_123',
        environment: 'production',
        resourceIdOrName: 'supabase-main',
        role: 'readonly',
        ttl: '10m',
        reason: 'investigate production issue',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('refuses production admin sessions in non-interactive mode without confirmation', async () => {
    client.nonInteractive = true;

    const exitCode = await shell(client, [
      '--environment',
      'production',
      '--role',
      'admin',
      '--reason',
      'support ticket 123',
    ]);

    expect(exitCode).toBe(1);
    expect(client.fetch).not.toHaveBeenCalled();
    expect(mockedOutput.error).toHaveBeenCalledWith(
      'Production database write access requires --confirm-production-write in non-interactive mode.'
    );
  });

  it('refuses production admin sessions without a reason', async () => {
    const exitCode = await shell(client, [
      '--environment',
      'production',
      '--role',
      'admin',
      '--confirm-production-write',
    ]);

    expect(exitCode).toBe(1);
    expect(client.fetch).not.toHaveBeenCalled();
    expect(mockedOutput.error).toHaveBeenCalledWith(
      'Production database write access requires --reason.'
    );
  });

  it('refuses shell sessions with ttl longer than one hour', async () => {
    const exitCode = await shell(client, ['--ttl', '2h']);

    expect(exitCode).toBe(1);
    expect(client.fetch).not.toHaveBeenCalled();
    expect(mockedResolveDatabaseScope).not.toHaveBeenCalled();
    expect(mockedOutput.error).toHaveBeenCalledWith(
      'Database shell TTL must be between 30 seconds and 1 hour.'
    );
  });

  it('does not print provider shell command details in json output', async () => {
    client.fetch.mockResolvedValue({
      sessionId: 'dbsess_123',
      expiresAt: '2026-05-08T12:15:00.000Z',
      auditId: 'aud_123',
      connectionString: 'postgres://temporary-secret@example/db',
      command: {
        executable: 'psql',
        args: ['postgres://temporary-secret@example/db'],
        env: { PGPASSWORD: 'temporary-secret' },
      },
    });

    const exitCode = await shell(client, ['--format', 'json']);

    expect(exitCode).toBe(0);
    expect(client.stdout.write).toHaveBeenCalledWith(
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
    expect(client.stdout.write.mock.calls[0][0]).not.toContain(
      'temporary-secret'
    );
  });

  it('refuses unsupported provider shell executables', async () => {
    client.fetch.mockResolvedValue({
      sessionId: 'dbsess_123',
      expiresAt: '2026-05-08T12:15:00.000Z',
      command: {
        executable: '/bin/sh',
        args: ['-c', 'echo unsafe'],
      },
    });

    const exitCode = await shell(client, []);

    expect(exitCode).toBe(1);
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockedOutput.error).toHaveBeenCalledWith(
      'Refusing to start unsupported database shell executable: /bin/sh'
    );
  });

  it('refuses allowed shell executable names when provided as a path', async () => {
    client.fetch.mockResolvedValue({
      sessionId: 'dbsess_123',
      expiresAt: '2026-05-08T12:15:00.000Z',
      command: {
        executable: '/tmp/psql',
        args: ['postgres://temporary-session@example/db'],
      },
    });

    const exitCode = await shell(client, []);

    expect(exitCode).toBe(1);
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockedOutput.error).toHaveBeenCalledWith(
      'Refusing to start unsupported database shell executable: /tmp/psql'
    );
  });

  it('starts allowed database shell executables without inheriting arbitrary local secrets', async () => {
    process.env.DATABASE_URL = 'postgres://app-secret@example/db';
    process.env.PATH = '/usr/bin';
    client.fetch.mockResolvedValue({
      sessionId: 'dbsess_123',
      expiresAt: '2026-05-08T12:15:00.000Z',
      command: {
        executable: 'psql',
        args: ['postgres://temporary-session@example/db'],
        env: {
          PATH: '/tmp/unsafe-bin',
          PGPASSWORD: 'temporary-session-secret',
        },
      },
    });

    const exitCode = await shell(client, []);

    expect(exitCode).toBe(0);
    expect(mockSpawn).toHaveBeenCalledWith(
      'psql',
      ['postgres://temporary-session@example/db'],
      {
        stdio: 'inherit',
        env: expect.objectContaining({
          PATH: '/usr/bin',
          PGPASSWORD: 'temporary-session-secret',
        }),
      }
    );
    expect(mockSpawn.mock.calls[0][2].env.PATH).toBe('/usr/bin');
    expect(mockSpawn.mock.calls[0][2].env).not.toHaveProperty('DATABASE_URL');

    delete process.env.DATABASE_URL;
  });

  it('shows a clear message when the database sessions API is unavailable', async () => {
    const err = new Error('Not Found') as Error & { status: number };
    err.status = 404;
    client.fetch = vi.fn().mockRejectedValue(err);

    const exitCode = await shell(client, []);

    expect(exitCode).toBe(1);
    expect(mockedOutput.error).toHaveBeenCalledWith(
      'Database operations are not available for this account or project yet.'
    );
  });
});
