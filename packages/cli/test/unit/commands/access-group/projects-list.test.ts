import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import accessGroup from '../../../../src/commands/access-group';
import { useUser } from '../../../mocks/user';
import { useAccessGroupProjects } from '../../../mocks/access-group';

describe('access-group projects list', () => {
  beforeEach(() => {
    useUser();
  });

  describe('--help', () => {
    it('tracks telemetry for the projects group', async () => {
      client.setArgv('access-group', 'projects', '--help');
      const exitCodePromise = accessGroup(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:projects',
          value: 'projects',
        },
        {
          key: 'flag:help',
          value: 'access-group projects',
        },
      ]);
    });

    it('tracks telemetry for the list leaf', async () => {
      client.setArgv('access-group', 'projects', 'list', '--help');
      const exitCodePromise = accessGroup(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:projects',
          value: 'projects',
        },
        {
          key: 'flag:help',
          value: 'access-group projects:list',
        },
      ]);
    });
  });

  it('errors when no group is passed', async () => {
    client.setArgv('access-group', 'projects', 'list');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Please provide an access group id or name'
    );
  });

  it('lists the projects of an access group', async () => {
    useAccessGroupProjects('ag_1');
    client.setArgv('access-group', 'projects', 'ls', 'ag_1');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(0);

    await expect(client.stderr).toOutput('Projects found in');
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('prj_1');
    expect(stdout).toContain('my-project');
    expect(stdout).toContain('PROJECT_VIEWER');
  });

  it('handles an empty project list', async () => {
    useAccessGroupProjects('ag_1', []);
    client.setArgv('access-group', 'projects', 'ls', 'ag_1');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('No projects found in');
  });

  it('outputs JSON on stdout', async () => {
    useAccessGroupProjects('ag_1');
    client.setArgv('access-group', 'projects', 'ls', 'ag_1', '--json');
    const exitCode = await accessGroup(client);
    expect(exitCode).toEqual(0);

    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.projects).toHaveLength(1);
    expect(parsed.projects[0].projectId).toEqual('prj_1');
  });
});
