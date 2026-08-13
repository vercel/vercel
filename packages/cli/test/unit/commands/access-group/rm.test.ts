import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import accessGroup from '../../../../src/commands/access-group';
import { useUser } from '../../../mocks/user';
import { useAccessGroups } from '../../../mocks/access-group';

describe('access-group rm', () => {
  beforeEach(() => {
    useUser();
  });

  afterEach(() => {
    client.nonInteractive = false;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('access-group', 'rm', '--help');
      const exitCodePromise = accessGroup(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'access-group:rm',
        },
      ]);
    });
  });

  it('errors when no id or name is passed', async () => {
    client.setArgv('access-group', 'rm');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Please provide an access group id or name'
    );
  });

  it('requires --yes in non-interactive mode and does not delete', async () => {
    useAccessGroups();
    let deleted = false;
    client.scenario.delete('/v1/access-groups/ag_1', (_req, res) => {
      deleted = true;
      res.status(200).end();
    });

    client.nonInteractive = true;
    client.setArgv('access-group', 'rm', 'ag_1');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(1);
    expect(deleted).toEqual(false);
    await expect(client.stderr).toOutput('`--yes` is required');
  });

  it('does not delete when the user declines', async () => {
    useAccessGroups();
    let deleted = false;
    client.scenario.delete('/v1/access-groups/ag_1', (_req, res) => {
      deleted = true;
      res.status(200).end();
    });

    client.setArgv('access-group', 'rm', 'ag_1');
    const exitCodePromise = accessGroup(client);
    await expect(client.stderr).toOutput('Are you sure');
    client.stdin.write('n\n');

    const exitCode = await exitCodePromise;
    expect(exitCode).toEqual(0);
    expect(deleted).toEqual(false);
  });

  it('deletes when the user confirms', async () => {
    useAccessGroups();
    let deleted = false;
    client.scenario.delete('/v1/access-groups/ag_1', (_req, res) => {
      deleted = true;
      res.status(200).end();
    });

    client.setArgv('access-group', 'rm', 'ag_1');
    const exitCodePromise = accessGroup(client);
    await expect(client.stderr).toOutput('Are you sure');
    client.stdin.write('y\n');

    const exitCode = await exitCodePromise;
    expect(exitCode).toEqual(0);
    expect(deleted).toEqual(true);
    await expect(client.stderr).toOutput('removed');

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:remove',
        value: 'rm',
      },
      {
        key: 'argument:idOrName',
        value: '[REDACTED]',
      },
    ]);
  });

  it('skips confirmation with --yes', async () => {
    useAccessGroups();
    let deleted = false;
    client.scenario.delete('/v1/access-groups/ag_1', (_req, res) => {
      deleted = true;
      res.status(200).end();
    });

    client.setArgv('access-group', 'rm', 'ag_1', '--yes');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(0);
    expect(deleted).toEqual(true);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:remove',
        value: 'rm',
      },
      {
        key: 'argument:idOrName',
        value: '[REDACTED]',
      },
      {
        key: 'flag:yes',
        value: 'TRUE',
      },
    ]);
  });

  it('maps a 404 to a not-found message', async () => {
    client.scenario.get('/v1/access-groups/ag_missing', (_req, res) => {
      res.status(404).json({ error: { code: 'not_found', message: 'nope' } });
    });
    client.setArgv('access-group', 'rm', 'ag_missing', '--yes');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Access group not found.');
  });
});
