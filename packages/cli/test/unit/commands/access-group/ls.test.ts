import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import accessGroup from '../../../../src/commands/access-group';
import { useUser } from '../../../mocks/user';
import {
  useAccessGroups,
  defaultAccessGroup,
} from '../../../mocks/access-group';

describe('access-group ls', () => {
  beforeEach(() => {
    useUser();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('access-group', 'ls', '--help');
      const exitCodePromise = accessGroup(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'access-group:ls',
        },
      ]);
    });
  });

  it('lists the access groups on the team', async () => {
    useAccessGroups();
    client.setArgv('access-group', 'ls');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(0);

    await expect(client.stderr).toOutput('Access groups found under');
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('engineering');
    expect(stdout).toContain('ag_1');
  });

  it('handles an empty list', async () => {
    useAccessGroups([]);
    client.setArgv('access-group', 'ls');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('No access groups found under');
  });

  it('outputs JSON on stdout without human prose', async () => {
    useAccessGroups();
    client.setArgv('access-group', 'ls', '--json');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(0);

    const stdout = client.stdout.getFullOutput();
    const parsed = JSON.parse(stdout);
    expect(parsed.accessGroups).toHaveLength(1);
    expect(parsed.accessGroups[0].name).toEqual('engineering');
  });

  it('paginates across cursors', async () => {
    let call = 0;
    client.scenario.get('/v1/access-groups', (req, res) => {
      call += 1;
      if (call === 1) {
        res.json({
          accessGroups: [defaultAccessGroup],
          pagination: { count: 1, next: 'cursor2' },
        });
      } else {
        expect(req.query.next).toEqual('cursor2');
        res.json({
          accessGroups: [
            { ...defaultAccessGroup, accessGroupId: 'ag_2', name: 'design' },
          ],
          pagination: { count: 1, next: null },
        });
      }
    });
    client.setArgv('access-group', 'ls', '--json');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(0);

    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.accessGroups).toHaveLength(2);
    expect(call).toEqual(2);
  });

  it('surfaces the permission error on 403', async () => {
    client.scenario.get('/v1/access-groups', (_req, res) => {
      res.status(403).json({
        error: {
          code: 'forbidden',
          message: 'Access groups are not available for this team.',
        },
      });
    });
    client.setArgv('access-group', 'ls');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Access groups are not available for this team.'
    );
  });

  it('rejects an invalid --format value', async () => {
    client.setArgv('access-group', 'ls', '--format', 'yaml');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Invalid output format');
  });
});
