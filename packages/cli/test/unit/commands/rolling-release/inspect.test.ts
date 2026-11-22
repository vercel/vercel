import { beforeEach, describe, expect, it, vi } from 'vitest';
import rollingRelease from '../../../../src/commands/rolling-release';
import requestRollingRelease from '../../../../src/commands/rolling-release/request-rolling-release';
import { resolveProjectContext } from '../../../../src/util/projects/resolve-project-context';
import { client } from '../../../mocks/client';

vi.mock('../../../../src/util/projects/resolve-project-context');
vi.mock('../../../../src/commands/rolling-release/request-rolling-release');

const mockedResolveProjectContext = vi.mocked(resolveProjectContext);
const mockedRequestRollingRelease = vi.mocked(requestRollingRelease);

describe('rolling-release inspect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockedResolveProjectContext.mockResolvedValue({
      status: 'linked',
      project: { id: 'prj_123' },
      org: { id: 'team_123', slug: 'my-team', type: 'team' },
    } as Awaited<ReturnType<typeof resolveProjectContext>>);
    mockedRequestRollingRelease.mockResolvedValue({
      state: 'ACTIVE',
    } as Awaited<ReturnType<typeof requestRollingRelease>>);
  });

  it('shows the rolling release without a deprecation warning', async () => {
    client.setArgv('rolling-release', 'inspect');
    const exitCode = await rollingRelease(client);

    expect(exitCode).toBe(0);
    expect(mockedRequestRollingRelease).toHaveBeenCalledWith({
      client,
      projectId: 'prj_123',
      teamId: 'team_123',
    });
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('"state": "ACTIVE"');
    expect(stderr).not.toContain('is deprecated');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:inspect', value: 'inspect' },
    ]);
  });

  it('warns when invoked as the deprecated fetch name', async () => {
    client.setArgv('rolling-release', 'fetch');
    const exitCode = await rollingRelease(client);

    expect(exitCode).toBe(0);
    expect(mockedRequestRollingRelease).toHaveBeenCalledTimes(1);
    expect(client.stderr.getFullOutput()).toContain(
      '`vercel rolling-release fetch` is deprecated. Use `vercel rolling-release inspect`.'
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:inspect', value: 'fetch' },
    ]);
  });

  it('writes the rolling release to stdout with --json', async () => {
    client.setArgv('rolling-release', 'inspect', '--json');

    expect(await rollingRelease(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      rollingRelease: { state: 'ACTIVE' },
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });
});
