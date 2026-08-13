import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import accessGroup from '../../../../src/commands/access-group';
import { useUser } from '../../../mocks/user';
import { useAccessGroups } from '../../../mocks/access-group';

describe('access-group inspect', () => {
  beforeEach(() => {
    useUser();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('access-group', 'inspect', '--help');
      const exitCodePromise = accessGroup(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'access-group:inspect',
        },
      ]);
    });
  });

  it('errors when no id or name is passed', async () => {
    client.setArgv('access-group', 'inspect');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Please provide an access group id or name'
    );
  });

  it('shows the access group by name and redacts the identifier in telemetry', async () => {
    useAccessGroups();
    client.setArgv('access-group', 'inspect', 'engineering');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(0);

    const output =
      client.stdout.getFullOutput() + client.stderr.getFullOutput();
    expect(output).toContain('engineering');
    expect(output).toContain('ag_1');
    expect(output).toContain('DEVELOPER');

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:inspect',
        value: 'inspect',
      },
      {
        key: 'argument:idOrName',
        value: '[REDACTED]',
      },
    ]);
  });

  it('outputs JSON on stdout', async () => {
    useAccessGroups();
    client.setArgv('access-group', 'inspect', 'ag_1', '--json');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(0);

    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.accessGroupId).toEqual('ag_1');
    expect(parsed.name).toEqual('engineering');
  });

  it('maps a 404 to a not-found message', async () => {
    client.scenario.get('/v1/access-groups/ag_missing', (_req, res) => {
      res.status(404).json({ error: { code: 'not_found', message: 'nope' } });
    });
    client.setArgv('access-group', 'inspect', 'ag_missing');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Access group not found.');
  });
});
