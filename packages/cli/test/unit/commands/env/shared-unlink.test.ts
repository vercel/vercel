import { describe, expect, it, beforeEach } from 'vitest';
import env from '../../../../src/commands/env';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';

const record = {
  id: 'env_1',
  key: 'API_URL',
  type: 'encrypted',
  target: ['production'],
  projectId: ['prj_a'],
};

function useResolve(data: unknown[] = [record]) {
  client.scenario.get('/v1/env', (_req, res) => {
    res.json({
      data,
      pagination: { count: data.length, next: null, prev: null },
    });
  });
}

function useUnlink() {
  let called = false;
  let path: string | undefined;
  client.scenario.patch('/v1/env/:id/unlink/:projectId', (req, res) => {
    called = true;
    path = req.path;
    res.json({ id: 'env_1' });
  });
  return { wasCalled: () => called, getPath: () => path };
}

describe('env shared unlink', () => {
  beforeEach(() => {
    useUser();
  });

  describe('--help', () => {
    it('renders help and tracks telemetry', async () => {
      client.setArgv('env', 'shared', 'unlink', '--help');
      const exitCode = await env(client);
      expect(exitCode).toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:shared', value: 'shared' },
        { key: 'flag:help', value: 'env shared:unlink' },
      ]);
    });
  });

  it('unlinks a project from the variable', async () => {
    useResolve();
    const mock = useUnlink();
    client.setArgv(
      'env',
      'shared',
      'unlink',
      'API_URL',
      '--project',
      'my-project',
      '--yes'
    );

    const exitCode = await env(client);
    expect(exitCode).toEqual(0);
    expect(mock.wasCalled()).toBe(true);
    expect(mock.getPath()).toContain('/v1/env/env_1/unlink/my-project');
    await expect(client.stderr).toOutput('Unlinked');
  });

  it('requires the --project flag', async () => {
    const mock = useUnlink();
    client.setArgv('env', 'shared', 'unlink', 'API_URL', '--yes');

    const exitCode = await env(client);
    expect(exitCode).toEqual(1);
    expect(mock.wasCalled()).toBe(false);
    await expect(client.stderr).toOutput('--project');
  });

  it('errors when the variable is not found', async () => {
    useResolve([]);
    const mock = useUnlink();
    client.setArgv(
      'env',
      'shared',
      'unlink',
      'MISSING',
      '--project',
      'my-project',
      '--yes'
    );

    const exitCode = await env(client);
    expect(exitCode).toEqual(1);
    expect(mock.wasCalled()).toBe(false);
    await expect(client.stderr).toOutput(
      'No Shared Environment Variable MISSING found'
    );
  });

  it('tracks telemetry with redacted argument and project', async () => {
    useResolve();
    useUnlink();
    client.setArgv(
      'env',
      'shared',
      'unlink',
      'API_URL',
      '--project',
      'my-project',
      '--yes'
    );
    await env(client);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:shared', value: 'shared' },
      { key: 'subcommand:unlink', value: 'unlink' },
      { key: 'argument:name-or-id', value: '[REDACTED]' },
      { key: 'option:project', value: '[REDACTED]' },
      { key: 'flag:yes', value: 'TRUE' },
    ]);
  });
});
