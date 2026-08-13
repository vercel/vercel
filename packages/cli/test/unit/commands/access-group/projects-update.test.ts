import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import accessGroup from '../../../../src/commands/access-group';
import { useUser } from '../../../mocks/user';

describe('access-group projects update', () => {
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
      client.setArgv('access-group', 'projects', 'update', '--help');
      const exitCodePromise = accessGroup(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:projects',
          value: 'projects',
        },
        {
          key: 'flag:help',
          value: 'access-group projects:update',
        },
      ]);
    });
  });

  it('errors when --role is missing', async () => {
    client.setArgv('access-group', 'projects', 'update', 'ag_1', 'my-project');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Please provide a role');
  });

  it('resolves the project and updates its role via PATCH', async () => {
    useProjectLookup();
    let body: unknown;
    let method: string | undefined;
    client.scenario.patch(
      '/v1/access-groups/ag_1/projects/prj_1',
      (req, res) => {
        body = req.body;
        method = req.method;
        res.json({ projectId: 'prj_1', role: 'ADMIN' });
      }
    );

    client.setArgv(
      'access-group',
      'projects',
      'update',
      'ag_1',
      'my-project',
      '--role',
      'ADMIN'
    );
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(0);
    expect(method).toEqual('PATCH');
    expect(body).toEqual({ role: 'ADMIN' });
    await expect(client.stderr).toOutput('updated to role');
  });
});
