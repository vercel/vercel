import { describe, it, expect, vi, afterEach } from 'vitest';
import projects from '../../../../src/commands/project';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { defaultProject, useProject } from '../../../mocks/project';
import { client } from '../../../mocks/client';

describe('access-summary', () => {
  describe('invalid argument', () => {
    it('errors', async () => {
      useUser();
      client.setArgv('project', 'access-summary', 'a', 'b');
      const exitCode = await projects(client);

      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput('Invalid number of arguments');
    });
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'project';
      const subcommand = 'access-summary';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = projects(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  it('prints a table of role counts', async () => {
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({
      ...defaultProject,
      name: 'test_project',
    });
    client.scenario.get(
      `/v1/projects/${project.id}/members/summary`,
      (_req, res) => {
        res.json({ VIEWER: 1, MEMBER: 3 });
      }
    );

    client.setArgv('project', 'access-summary', project.name!);
    const exitCode = await projects(client);
    expect(exitCode).toEqual(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('VIEWER');
    expect(out).toContain('MEMBER');
    expect(out).toContain('1');
    expect(out).toContain('3');
  });

  it('writes JSON to stdout with --format json', async () => {
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({
      ...defaultProject,
      name: 'test_project',
    });
    client.scenario.get(
      `/v1/projects/${project.id}/members/summary`,
      (_req, res) => {
        res.json({ CONTRIBUTOR: 2 });
      }
    );

    client.setArgv(
      'project',
      'access-summary',
      project.name!,
      '--format',
      'json'
    );
    const exitCode = await projects(client);
    expect(exitCode).toEqual(0);
    expect(client.stdout.getFullOutput().trim()).toBe(
      JSON.stringify({ CONTRIBUTOR: 2 }, null, 2)
    );
  });

  it('routes alias summary and tracks subcommand telemetry', async () => {
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({
      ...defaultProject,
      name: 'test_project',
    });
    client.scenario.get(
      `/v1/projects/${project.id}/members/summary`,
      (_req, res) => {
        res.json({ MEMBER: 1 });
      }
    );

    client.setArgv('project', 'summary', project.name!);
    await projects(client);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:access-summary',
        value: 'summary',
      },
    ]);
  });

  describe('--non-interactive', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      client.nonInteractive = false;
    });

    it('outputs error JSON when the summary API returns 403', async () => {
      useUser();
      useTeams('team_dummy');
      const { project } = useProject({
        ...defaultProject,
        name: 'test_project',
      });

      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.scenario.get(
        `/v1/projects/${project.id}/members/summary`,
        (_req, res) => {
          res.status(403).json({
            error: {
              code: 'forbidden',
              message: 'Invalid team plan.',
            },
          });
        }
      );

      client.nonInteractive = true;
      client.setArgv(
        'project',
        'access-summary',
        project.name!,
        '--non-interactive'
      );

      await expect(projects(client)).rejects.toThrow('exit:1');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'forbidden',
        message: 'Invalid team plan.',
      });
      expect(Array.isArray(payload.next)).toBe(true);
    });
  });

  it('logs when the API returns an empty object', async () => {
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({
      ...defaultProject,
      name: 'test_project',
    });
    client.scenario.get(
      `/v1/projects/${project.id}/members/summary`,
      (_req, res) => {
        res.json({});
      }
    );

    client.setArgv('project', 'access-summary', project.name!);
    const exitCode = await projects(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('No summary data returned.');
  });
});
