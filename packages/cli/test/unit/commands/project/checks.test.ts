import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, it, expect, vi, afterEach } from 'vitest';
import projects from '../../../../src/commands/project';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { defaultProject, useProject } from '../../../mocks/project';
import { client } from '../../../mocks/client';

describe('checks', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('project', 'checks', '--help');
      const exitCodePromise = projects(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'project:checks',
        },
      ]);
    });
  });

  it('rejects invalid --blocks', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({ ...defaultProject, name: 'p' });

    client.setArgv('project', 'checks', 'p', '--blocks', 'invalid');
    const exitCode = await projects(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('--blocks');
  });

  it('prints a table', async () => {
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({
      ...defaultProject,
      name: 'test_project',
    });

    client.scenario.get(`/v2/projects/${project.id}/checks`, (req, res) => {
      expect(req.query.blocks).toBeUndefined();
      res.json({
        checks: [
          {
            id: 'chk_1',
            name: 'Lint',
            blocks: 'deployment-start',
            target: 'preview',
          },
        ],
      });
    });

    client.setArgv('project', 'checks', project.name!);
    const exitCode = await projects(client);
    expect(exitCode).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain('Lint');
    expect(client.stderr.getFullOutput()).toContain('chk_1');
  });

  it('rejects --file without `add`', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({ ...defaultProject, name: 'p' });

    client.setArgv('project', 'checks', '--file', './x.json');
    const exitCode = await projects(client);
    expect(exitCode).toEqual(2);
    await expect(client.stderr).toOutput('checks add');
  });

  it('creates a check via POST with flags', async () => {
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({
      ...defaultProject,
      name: 'test_project',
    });

    client.scenario.post(`/v2/projects/${project.id}/checks`, (req, res) => {
      expect(req.body).toMatchObject({
        name: 'Lint',
        requires: 'deployment-url',
        blocks: 'deployment-alias',
      });
      res.json({
        id: 'chk_new',
        name: 'Lint',
        projectId: project.id,
      });
    });

    client.setArgv(
      'project',
      'checks',
      'add',
      project.name!,
      '--check-name',
      'Lint',
      '--requires',
      'deployment-url',
      '--blocks',
      'deployment-alias'
    );
    const exitCode = await projects(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('chk_new');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:checks',
        value: 'checks add',
      },
    ]);
  });

  it('creates a check from --file', async () => {
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({
      ...defaultProject,
      name: 'test_project',
    });

    const dir = mkdtempSync(join(tmpdir(), 'vc-cli-checks-'));
    const filePath = join(dir, 'body.json');
    writeFileSync(
      filePath,
      JSON.stringify({
        name: 'From file',
        requires: 'none',
        blocks: 'none',
      })
    );

    try {
      client.scenario.post(`/v2/projects/${project.id}/checks`, (req, res) => {
        expect(req.body).toMatchObject({
          name: 'From file',
          requires: 'none',
        });
        res.json({ id: 'chk_file', name: 'From file' });
      });

      client.setArgv(
        'project',
        'checks',
        'add',
        project.name!,
        '--file',
        filePath
      );
      const exitCode = await projects(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('chk_file');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('removes a check via DELETE', async () => {
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({
      ...defaultProject,
      name: 'test_project',
    });

    client.scenario.delete(
      `/v2/projects/${project.id}/checks/chk_to_remove`,
      (_req, res) => {
        res.json({ success: true });
      }
    );

    client.setArgv(
      'project',
      'checks',
      'remove',
      'chk_to_remove',
      project.name!
    );
    const exitCode = await projects(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Removed check chk_to_remove');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:checks',
        value: 'checks remove',
      },
    ]);
  });

  it('accepts rm alias for remove', async () => {
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({
      ...defaultProject,
      name: 'test_project',
    });

    client.scenario.delete(
      `/v2/projects/${project.id}/checks/chk_rm`,
      (_req, res) => {
        res.json({ success: true });
      }
    );

    client.setArgv('project', 'checks', 'rm', 'chk_rm', project.name!);
    const exitCode = await projects(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('chk_rm');
  });

  it('passes blocks query param', async () => {
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({
      ...defaultProject,
      name: 'test_project',
    });

    client.scenario.get(`/v2/projects/${project.id}/checks`, (req, res) => {
      expect(req.query.blocks).toBe('deployment-alias');
      res.json({ checks: [] });
    });

    client.setArgv(
      'project',
      'checks',
      project.name!,
      '--blocks',
      'deployment-alias'
    );
    const exitCode = await projects(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('No checks configured');
  });

  describe('--non-interactive', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      client.nonInteractive = false;
    });

    it('outputs missing_arguments JSON when remove has no check id', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({ ...defaultProject, name: 'p' });

      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv('project', 'checks', 'rm', '--non-interactive');

      await expect(projects(client)).rejects.toThrow('exit:1');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'missing_arguments',
      });
      expect(payload.message).toMatch(/check id/i);
      expect(
        payload.next?.some((n: { command: string }) =>
          /project checks/.test(n.command)
        )
      ).toBe(true);
    });

    it('outputs ok JSON when listing checks', async () => {
      useUser();
      useTeams('team_dummy');
      const { project } = useProject({
        ...defaultProject,
        name: 'test_project',
      });

      client.scenario.get(`/v2/projects/${project.id}/checks`, (_req, res) => {
        res.json({
          checks: [{ id: 'chk_1', name: 'Lint', blocks: 'none' }],
        });
      });

      client.nonInteractive = true;
      client.setArgv('project', 'checks', project.name!, '--non-interactive');

      const exitCode = await projects(client);
      expect(exitCode).toBe(0);
      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'ok',
        checks: [{ id: 'chk_1', name: 'Lint', blocks: 'none' }],
      });
      expect(payload.message).toMatch(/1 deployment check/);
    });

    it('includes pagination in ok JSON when the API returns it', async () => {
      useUser();
      useTeams('team_dummy');
      const { project } = useProject({
        ...defaultProject,
        name: 'test_project',
      });

      const pagination = { count: 1, next: null, prev: null };
      client.scenario.get(`/v2/projects/${project.id}/checks`, (_req, res) => {
        res.json({
          checks: [{ id: 'chk_1', name: 'Lint', blocks: 'none' }],
          pagination,
        });
      });

      client.nonInteractive = true;
      client.setArgv('project', 'checks', project.name!, '--non-interactive');

      const exitCode = await projects(client);
      expect(exitCode).toBe(0);
      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload.pagination).toEqual(pagination);
    });
  });
});
