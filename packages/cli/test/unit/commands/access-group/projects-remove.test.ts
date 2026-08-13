import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import accessGroup from '../../../../src/commands/access-group';
import { useUser } from '../../../mocks/user';

describe('access-group projects remove', () => {
  beforeEach(() => {
    useUser();
  });

  afterEach(() => {
    client.nonInteractive = false;
  });

  function useProjectLookup() {
    client.scenario.get('/v9/projects/my-project', (_req, res) => {
      res.json({ id: 'prj_1', name: 'my-project' });
    });
  }

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('access-group', 'projects', 'rm', '--help');
      const exitCodePromise = accessGroup(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:projects',
          value: 'projects',
        },
        {
          key: 'flag:help',
          value: 'access-group projects:rm',
        },
      ]);
    });
  });

  it('requires --yes in non-interactive mode and does not delete', async () => {
    useProjectLookup();
    let deleted = false;
    client.scenario.delete(
      '/v1/access-groups/ag_1/projects/prj_1',
      (_req, res) => {
        deleted = true;
        res.status(200).end();
      }
    );

    client.nonInteractive = true;
    client.setArgv('access-group', 'projects', 'rm', 'ag_1', 'my-project');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(1);
    expect(deleted).toEqual(false);
    await expect(client.stderr).toOutput('`--yes` is required');
  });

  it('does not delete when the user declines', async () => {
    useProjectLookup();
    let deleted = false;
    client.scenario.delete(
      '/v1/access-groups/ag_1/projects/prj_1',
      (_req, res) => {
        deleted = true;
        res.status(200).end();
      }
    );

    client.setArgv('access-group', 'projects', 'rm', 'ag_1', 'my-project');
    const exitCodePromise = accessGroup(client);
    await expect(client.stderr).toOutput('Are you sure');
    client.stdin.write('n\n');

    const exitCode = await exitCodePromise;
    expect(exitCode).toEqual(0);
    expect(deleted).toEqual(false);
  });

  it('deletes the project with --yes', async () => {
    useProjectLookup();
    let deleted = false;
    client.scenario.delete(
      '/v1/access-groups/ag_1/projects/prj_1',
      (_req, res) => {
        deleted = true;
        res.status(200).end();
      }
    );

    client.setArgv(
      'access-group',
      'projects',
      'rm',
      'ag_1',
      'my-project',
      '--yes'
    );
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(0);
    expect(deleted).toEqual(true);
    await expect(client.stderr).toOutput('removed from access group');
  });
});
