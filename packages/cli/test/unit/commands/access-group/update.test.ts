import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import accessGroup from '../../../../src/commands/access-group';
import { useUser } from '../../../mocks/user';
import { defaultAccessGroup } from '../../../mocks/access-group';

describe('access-group update', () => {
  beforeEach(() => {
    useUser();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('access-group', 'update', '--help');
      const exitCodePromise = accessGroup(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'access-group:update',
        },
      ]);
    });
  });

  it('errors when no id or name is passed', async () => {
    client.setArgv('access-group', 'update');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Please provide an access group id or name'
    );
  });

  it('errors when no field to update is provided', async () => {
    client.setArgv('access-group', 'update', 'ag_1');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Please provide at least one field to update'
    );
  });

  it('renames an access group', async () => {
    let body: unknown;
    let receivedPath: string | undefined;
    client.scenario.post('/v1/access-groups/ag_1', (req, res) => {
      body = req.body;
      receivedPath = req.path;
      res.json({ ...defaultAccessGroup, name: 'renamed' });
    });

    client.setArgv('access-group', 'update', 'ag_1', '--name', 'renamed');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(0);
    expect(body).toEqual({ name: 'renamed' });
    expect(receivedPath).toEqual('/v1/access-groups/ag_1');
    await expect(client.stderr).toOutput('updated under');

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:update',
        value: 'update',
      },
      {
        key: 'argument:idOrName',
        value: '[REDACTED]',
      },
      {
        key: 'option:name',
        value: '[REDACTED]',
      },
    ]);
  });

  it('outputs JSON on stdout', async () => {
    client.scenario.post('/v1/access-groups/ag_1', (_req, res) => {
      res.json({ ...defaultAccessGroup, name: 'renamed' });
    });
    client.setArgv(
      'access-group',
      'update',
      'ag_1',
      '--name',
      'renamed',
      '--json'
    );
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(0);

    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.name).toEqual('renamed');
  });

  it('maps a 404 to a not-found message', async () => {
    client.scenario.post('/v1/access-groups/ag_missing', (_req, res) => {
      res.status(404).json({ error: { code: 'not_found', message: 'nope' } });
    });
    client.setArgv('access-group', 'update', 'ag_missing', '--name', 'renamed');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Access group not found.');
  });
});
