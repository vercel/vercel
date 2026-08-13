import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import accessGroup from '../../../../src/commands/access-group';
import { useUser } from '../../../mocks/user';

describe('access-group projects add', () => {
  beforeEach(() => {
    useUser();
  });

  function useProjectLookup() {
    client.scenario.get('/v9/projects/my-project', (_req, res) => {
      res.json({ id: 'prj_1', name: 'my-project' });
    });
  }

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('access-group', 'projects', 'add', '--help');
      const exitCodePromise = accessGroup(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:projects',
          value: 'projects',
        },
        {
          key: 'flag:help',
          value: 'access-group projects:add',
        },
      ]);
    });
  });

  it('errors when the project is missing', async () => {
    client.setArgv('access-group', 'projects', 'add', 'ag_1');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Please provide an access group and a project'
    );
  });

  it('errors when --role is missing', async () => {
    client.setArgv('access-group', 'projects', 'add', 'ag_1', 'my-project');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Please provide a role');
  });

  it('errors on an invalid role', async () => {
    client.setArgv(
      'access-group',
      'projects',
      'add',
      'ag_1',
      'my-project',
      '--role',
      'SUPERUSER'
    );
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Invalid role');
  });

  it('resolves the project and adds it with a role', async () => {
    useProjectLookup();
    let body: unknown;
    client.scenario.post('/v1/access-groups/ag_1/projects', (req, res) => {
      body = req.body;
      res.json({ projectId: 'prj_1', role: 'PROJECT_VIEWER' });
    });

    client.setArgv(
      'access-group',
      'projects',
      'add',
      'ag_1',
      'my-project',
      '--role',
      'PROJECT_VIEWER'
    );
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(0);
    expect(body).toEqual({ projectId: 'prj_1', role: 'PROJECT_VIEWER' });
    await expect(client.stderr).toOutput('added to access group');

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:projects',
        value: 'projects',
      },
      {
        key: 'subcommand:add',
        value: 'add',
      },
      {
        key: 'argument:group',
        value: '[REDACTED]',
      },
      {
        key: 'argument:project',
        value: '[REDACTED]',
      },
      {
        key: 'option:role',
        value: 'PROJECT_VIEWER',
      },
    ]);
  });

  it('errors when the project is not found', async () => {
    client.scenario.get('/v9/projects/ghost', (_req, res) => {
      res.status(404).json({ error: { code: 'not_found', message: 'nope' } });
    });
    client.setArgv(
      'access-group',
      'projects',
      'add',
      'ag_1',
      'ghost',
      '--role',
      'ADMIN'
    );
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('not found');
  });
});
