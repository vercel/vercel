import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import accessGroup from '../../../../src/commands/access-group';
import { useUser } from '../../../mocks/user';
import { defaultAccessGroup } from '../../../mocks/access-group';

describe('access-group add', () => {
  beforeEach(() => {
    useUser();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('access-group', 'add', '--help');
      const exitCodePromise = accessGroup(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'access-group:add',
        },
      ]);
    });
  });

  it('errors when no name is passed', async () => {
    client.setArgv('access-group', 'add');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Please provide a name');
  });

  it('creates an access group and reports success', async () => {
    let body: unknown;
    client.scenario.post('/v1/access-groups', (req, res) => {
      body = req.body;
      res.json({ ...defaultAccessGroup, name: 'new-group' });
    });

    client.setArgv('access-group', 'add', 'new-group');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(0);
    expect(body).toEqual({ name: 'new-group' });
    await expect(client.stderr).toOutput('created under');

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:add',
        value: 'add',
      },
      {
        key: 'argument:name',
        value: '[REDACTED]',
      },
    ]);
  });

  it('outputs JSON on stdout', async () => {
    client.scenario.post('/v1/access-groups', (_req, res) => {
      res.json({ ...defaultAccessGroup, name: 'new-group' });
    });
    client.setArgv('access-group', 'add', 'new-group', '--json');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(0);

    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.name).toEqual('new-group');
  });

  it('surfaces a 400 already-exists error', async () => {
    client.scenario.post('/v1/access-groups', (_req, res) => {
      res.status(400).json({
        error: {
          code: 'bad_request',
          message: 'Access group new-group already exists in team team_dummy.',
        },
      });
    });
    client.setArgv('access-group', 'add', 'new-group');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('already exists');
  });
});
