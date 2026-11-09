import { join } from 'path';
import { outputFile } from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import project from '../../../../src/commands/project';
import {
  defaultProject,
  useProject,
  useProjectList,
  useUnknownProject,
} from '../../../mocks/project';
import { useUser } from '../../../mocks/user';
import { createTeam, useTeam } from '../../../mocks/team';
import type { Project } from '@vercel-internals/types';

describe('project resume', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    client.nonInteractive = false;
    client.stdin.isTTY = true;
  });

  it('tracks telemetry for --help', async () => {
    client.setArgv('project', 'resume', '--help');
    const exitCodePromise = project(client);
    await expect(exitCodePromise).resolves.toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:help', value: 'project:resume' },
    ]);
  });

  it('errors when the project does not exist', async () => {
    useUser();
    useUnknownProject();

    client.setArgv('project', 'resume', 'unknown-project');
    const exitCode = await project(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'There is no project for "unknown-project"'
    );
  });

  it('emits a JSON error on stdout when the project is not found with --json', async () => {
    useUser();
    useUnknownProject();

    client.setArgv('project', 'resume', 'unknown-project', '--json');
    const exitCode = await project(client);
    expect(exitCode).toEqual(1);

    const payload = JSON.parse(client.stdout.getFullOutput().trim());
    expect(payload).toEqual({
      status: 'error',
      reason: 'project_not_found',
      message: 'There is no project for "unknown-project"',
    });
  });

  it('resumes a named project without a confirmation prompt', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_resume',
      name: 'my-project',
    });

    const confirmSpy = vi.spyOn(client.input, 'confirm');

    let unpauseCalled = false;
    client.scenario.post('/v1/projects/:projectId/unpause', (req, res) => {
      unpauseCalled = true;
      expect(req.params.projectId).toBe('prj_resume');
      res.status(200).end();
    });

    client.setArgv('project', 'resume', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toEqual(0);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(unpauseCalled).toBe(true);
    await expect(client.stderr).toOutput(
      'Production traffic for my-project resumed'
    );

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:resume', value: 'resume' },
      { key: 'argument:project', value: '[REDACTED]' },
    ]);
  });

  it('supports the unpause alias and outputs JSON with --json', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_resume',
      name: 'my-project',
    });

    client.scenario.post('/v1/projects/:projectId/unpause', (_req, res) => {
      res.status(200).end();
    });

    client.setArgv('project', 'unpause', 'my-project', '--json');
    const exitCode = await project(client);
    expect(exitCode).toEqual(0);

    const jsonOutput = JSON.parse(client.stdout.getFullOutput().trim());
    expect(jsonOutput).toEqual({
      id: 'prj_resume',
      name: 'my-project',
      paused: false,
    });

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:resume', value: 'unpause' },
      { key: 'argument:project', value: '[REDACTED]' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });

  it('maps a 403 from the unpause API to a friendly error', async () => {
    useUser();
    useProject({
      ...defaultProject,
      id: 'prj_resume',
      name: 'my-project',
    });

    client.scenario.post('/v1/projects/:projectId/unpause', (_req, res) => {
      res.status(403).json({
        error: { code: 'forbidden', message: 'Not allowed.' },
      });
    });

    client.setArgv('project', 'resume', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Not allowed.');
  });

  describe('non-interactive / agentic', () => {
    it('resumes and prints JSON without prompting', async () => {
      useUser();
      useProject({
        ...defaultProject,
        id: 'prj_resume',
        name: 'my-project',
      });

      const confirmSpy = vi.spyOn(client.input, 'confirm');

      let unpauseCalled = false;
      client.scenario.post('/v1/projects/:projectId/unpause', (req, res) => {
        unpauseCalled = true;
        expect(req.params.projectId).toBe('prj_resume');
        res.status(200).end();
      });

      client.nonInteractive = true;
      client.setArgv('project', 'resume', 'my-project', '--non-interactive');
      const exitCode = await project(client);

      expect(exitCode).toEqual(0);
      expect(unpauseCalled).toBe(true);
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(JSON.parse(client.stdout.getFullOutput().trim())).toEqual({
        id: 'prj_resume',
        name: 'my-project',
        paused: false,
      });
    });
  });

  describe('non-TTY / piped', () => {
    it('resumes and prints JSON without prompting', async () => {
      useUser();
      useProject({
        ...defaultProject,
        id: 'prj_resume',
        name: 'my-project',
      });

      const confirmSpy = vi.spyOn(client.input, 'confirm');

      let unpauseCalled = false;
      client.scenario.post('/v1/projects/:projectId/unpause', (_req, res) => {
        unpauseCalled = true;
        res.status(200).end();
      });

      client.stdin.isTTY = false;
      client.setArgv('project', 'resume', 'my-project');
      const exitCode = await project(client);

      expect(exitCode).toEqual(0);
      expect(unpauseCalled).toBe(true);
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(JSON.parse(client.stdout.getFullOutput().trim())).toEqual({
        id: 'prj_resume',
        name: 'my-project',
        paused: false,
      });
      await expect(client.stderr).not.toOutput(
        'This command must be run interactively'
      );
    });
  });

  describe('several projects', () => {
    function useProjects(...projects: Array<Partial<Project>>) {
      for (const p of projects) {
        useProject({ ...defaultProject, ...p });
      }
    }

    function useUnpause(status = 200) {
      const resumed: string[] = [];
      client.scenario.post('/v1/projects/:projectId/unpause', (req, res) => {
        if (typeof status === 'number' && status !== 200) {
          return res.status(status).json({
            error: { code: 'forbidden', message: 'Not allowed.' },
          });
        }
        resumed.push(req.params.projectId);
        res.status(200).end();
      });
      return resumed;
    }

    it('asks once, then resumes each project', async () => {
      useUser();
      useProjects(
        { id: 'prj_a', name: 'site-a', paused: true },
        { id: 'prj_b', name: 'site-b', paused: true }
      );
      const resumed = useUnpause();
      const confirmSpy = vi
        .spyOn(client.input, 'confirm')
        .mockResolvedValue(true);

      client.setArgv('project', 'resume', 'site-a', 'site-b');
      const exitCode = await project(client);

      expect(exitCode).toEqual(0);
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(confirmSpy).toHaveBeenCalledWith(
        'Resume production traffic for 2 projects?',
        false
      );
      expect(resumed).toEqual(['prj_a', 'prj_b']);
      await expect(client.stderr).toOutput('Resumed         2 projects');
    });

    it('changes nothing and exits 130 when the prompt is declined', async () => {
      useUser();
      useProjects(
        { id: 'prj_a', name: 'site-a', paused: true },
        { id: 'prj_b', name: 'site-b', paused: true }
      );
      const resumed = useUnpause();
      vi.spyOn(client.input, 'confirm').mockResolvedValue(false);

      client.setArgv('project', 'resume', 'site-a', 'site-b');
      const exitCode = await project(client);

      expect(exitCode).toEqual(130);
      expect(resumed).toEqual([]);
      await expect(client.stderr).toOutput('Canceled. Nothing was changed.');
    });

    it('skips projects that are not paused', async () => {
      useUser();
      useProjects(
        { id: 'prj_a', name: 'site-a', paused: true },
        { id: 'prj_b', name: 'site-b', paused: false }
      );
      const resumed = useUnpause();

      client.nonInteractive = true;
      client.setArgv(
        'project',
        'resume',
        'site-a',
        'site-b',
        '--yes',
        '--non-interactive'
      );
      const exitCode = await project(client);

      expect(exitCode).toEqual(0);
      expect(resumed).toEqual(['prj_a']);
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
        results: [
          { id: 'prj_a', name: 'site-a', outcome: 'resumed' },
          { id: 'prj_b', name: 'site-b', outcome: 'unchanged' },
        ],
        summary: { succeeded: 1, failed: 0, skipped: 1, unknown: 0 },
      });
    });

    it('does not ask when only one named project is paused', async () => {
      useUser();
      useProjects(
        { id: 'prj_a', name: 'site-a', paused: true },
        { id: 'prj_b', name: 'site-b', paused: false }
      );
      const resumed = useUnpause();
      const confirmSpy = vi.spyOn(client.input, 'confirm');

      client.setArgv('project', 'resume', 'site-a', 'site-b');
      const exitCode = await project(client);

      expect(exitCode).toEqual(0);
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(resumed).toEqual(['prj_a']);
      await expect(client.stderr).toOutput('Resumed         1 project');
    });

    it('does nothing when none of the projects are paused', async () => {
      useUser();
      useProjects(
        { id: 'prj_a', name: 'site-a' },
        { id: 'prj_b', name: 'site-b' }
      );
      const resumed = useUnpause();
      const confirmSpy = vi.spyOn(client.input, 'confirm');

      client.setArgv('project', 'resume', 'site-a', 'site-b');
      const exitCode = await project(client);

      expect(exitCode).toEqual(0);
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(resumed).toEqual([]);
      await expect(client.stderr).toOutput(
        "Nothing to resume. site-a and site-b aren't paused."
      );
    });

    it('resumes a project named twice only once', async () => {
      useUser();
      useProjects(
        { id: 'prj_a', name: 'site-a', paused: true },
        { id: 'prj_b', name: 'site-b', paused: true }
      );
      const resumed = useUnpause();
      vi.spyOn(client.input, 'confirm').mockResolvedValue(true);

      client.setArgv('project', 'resume', 'site-a', 'prj_a', 'site-b');
      const exitCode = await project(client);

      expect(exitCode).toEqual(0);
      expect(resumed).toEqual(['prj_a', 'prj_b']);
    });

    it('changes nothing when a project does not exist', async () => {
      useUser();
      useProjects({ id: 'prj_a', name: 'site-a', paused: true });
      useUnknownProject();
      const resumed = useUnpause();

      client.setArgv('project', 'resume', 'site-a', 'nope', 'gone');
      const exitCode = await project(client);

      expect(exitCode).toEqual(1);
      expect(resumed).toEqual([]);
      await expect(client.stderr).toOutput(
        'There are no projects for "nope" and "gone"'
      );
    });

    it('needs --yes without a terminal', async () => {
      useUser();
      useProjects(
        { id: 'prj_a', name: 'site-a', paused: true },
        { id: 'prj_b', name: 'site-b', paused: true }
      );
      const resumed = useUnpause();
      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => undefined) as never);

      client.nonInteractive = true;
      client.setArgv(
        'project',
        'resume',
        'site-a',
        'site-b',
        '--non-interactive'
      );
      await project(client);

      expect(exitSpy).toHaveBeenCalledWith(2);
      expect(resumed).toEqual([]);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'confirmation_required',
        message:
          "Can't resume 2 projects without --yes in non-interactive mode.",
        userActionRequired: true,
        data: {
          projects: [
            { id: 'prj_a', name: 'site-a' },
            { id: 'prj_b', name: 'site-b' },
          ],
        },
      });
      expect(payload.next[0].command).toEqual(
        'vercel project resume site-a site-b --non-interactive --yes'
      );
      expect(payload.next[0].when).toContain('Only after a human approves');
    });

    it('reports each failure and exits 1 when some fail', async () => {
      useUser();
      useProjects(
        { id: 'prj_a', name: 'site-a', paused: true },
        { id: 'prj_b', name: 'site-b', paused: true }
      );
      const resumed: string[] = [];
      client.scenario.post('/v1/projects/:projectId/unpause', (req, res) => {
        if (req.params.projectId === 'prj_b') {
          return res.status(403).json({
            error: { code: 'forbidden', message: 'Not allowed.' },
          });
        }
        resumed.push(req.params.projectId);
        res.status(200).end();
      });
      vi.spyOn(client.input, 'confirm').mockResolvedValue(true);

      client.setArgv('project', 'resume', 'site-a', 'site-b');
      const exitCode = await project(client);

      expect(exitCode).toEqual(1);
      expect(resumed).toEqual(['prj_a']);
      await expect(client.stderr).toOutput(
        'Resumed 1 of 2 projects. 1 failed.'
      );
      await expect(client.stderr).toOutput('Not allowed.');
      await expect(client.stderr).toOutput('vercel project resume prj_b');
    });

    it('reports a resume it could not confirm as unknown', async () => {
      useUser();
      useProjects(
        { id: 'prj_a', name: 'site-a', paused: true },
        { id: 'prj_b', name: 'site-b', paused: true }
      );
      client.scenario.post('/v1/projects/:projectId/unpause', (req, res) => {
        if (req.params.projectId === 'prj_b') {
          // A body that can't be read leaves the outcome unknown.
          return res.status(200).type('json').send('{');
        }
        res.status(200).end();
      });

      client.setArgv(
        'project',
        'resume',
        'site-a',
        'site-b',
        '--yes',
        '--json'
      );
      const exitCode = await project(client);

      expect(exitCode).toEqual(1);
      const result = JSON.parse(client.stdout.getFullOutput());
      expect(result.summary).toEqual({
        succeeded: 1,
        failed: 0,
        skipped: 0,
        unknown: 1,
      });
      expect(result.results[1]).toMatchObject({
        id: 'prj_b',
        outcome: 'unknown',
        error: { code: 'unknown_outcome' },
      });
    });

    it('reports failures in the JSON results', async () => {
      useUser();
      useProjects(
        { id: 'prj_a', name: 'site-a', paused: true },
        { id: 'prj_b', name: 'site-b', paused: true }
      );
      useUnpause(403);

      client.setArgv(
        'project',
        'resume',
        'site-a',
        'site-b',
        '--yes',
        '--json'
      );
      const exitCode = await project(client);

      expect(exitCode).toEqual(1);
      const result = JSON.parse(client.stdout.getFullOutput());
      expect(result.summary).toEqual({
        succeeded: 0,
        failed: 2,
        skipped: 0,
        unknown: 0,
      });
      expect(result.results[0]).toEqual({
        id: 'prj_a',
        name: 'site-a',
        outcome: 'failed',
        error: { code: 'forbidden', message: 'Not allowed.' },
      });
    });
  });

  describe('--all', () => {
    /** Projects in the team, newest update first. */
    function useTeamProjects(projects: Array<Partial<Project>>) {
      useProjectList(projects.map((p, i) => ({ updatedAt: 1000 - i, ...p })));
    }

    function useUnpause() {
      const resumed: string[] = [];
      client.scenario.post('/v1/projects/:projectId/unpause', (req, res) => {
        resumed.push(req.params.projectId);
        res.status(200).end();
      });
      return resumed;
    }

    /** A team that isn't the user's only one, so it isn't explicit by itself. */
    function useCurrentTeam() {
      const team = useTeam('team_resume');
      // Random slugs can hold characters that aren't safe in a command.
      team.slug = 'acme';
      createTeam();
      client.config.currentTeam = team.id;
      return team;
    }

    afterEach(() => {
      delete process.env.VERCEL_ORG_ID;
    });

    it('resumes every paused project after one prompt', async () => {
      useUser();
      const team = useCurrentTeam();
      useTeamProjects([
        { id: 'prj_a', name: 'site-a', paused: true },
        { id: 'prj_b', name: 'site-b', paused: false },
        { id: 'prj_c', name: 'site-c', paused: true },
      ]);
      const resumed = useUnpause();
      const confirmSpy = vi
        .spyOn(client.input, 'confirm')
        .mockResolvedValue(true);

      client.setArgv('project', 'resume', '--all');
      const exitCode = await project(client);

      expect(exitCode).toEqual(0);
      expect(confirmSpy).toHaveBeenCalledWith(
        'Resume production traffic for 2 projects?',
        false
      );
      expect(resumed).toEqual(['prj_a', 'prj_c']);
      await expect(client.stderr).toOutput(team.slug);
      await expect(client.stderr).toOutput('site-a and site-c');
      await expect(client.stderr).toOutput('Resumed');

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:resume', value: 'resume' },
        { key: 'flag:all', value: 'TRUE' },
      ]);
    });

    it('resumes projects paused at the same moment across API pages', async () => {
      useUser();
      useCurrentTeam();
      // The API's first page of 100 ends inside the pair paused at 500.
      useProjectList([
        ...Array.from({ length: 99 }, (_, i) => ({
          id: `prj_${i}`,
          name: `site-${i}`,
          updatedAt: 1000 - i,
        })),
        { id: 'prj_x', name: 'site-x', paused: true, updatedAt: 500 },
        { id: 'prj_y', name: 'site-y', paused: true, updatedAt: 500 },
      ]);
      const resumed = useUnpause();
      vi.spyOn(client.input, 'confirm').mockResolvedValue(true);

      client.setArgv('project', 'resume', '--all');
      const exitCode = await project(client);

      expect(exitCode).toEqual(0);
      expect(resumed).toEqual(['prj_x', 'prj_y']);
    });

    it('says so when nothing is paused', async () => {
      useUser();
      const team = useCurrentTeam();
      useTeamProjects([{ id: 'prj_a', name: 'site-a', paused: false }]);
      const resumed = useUnpause();
      const confirmSpy = vi.spyOn(client.input, 'confirm');

      client.setArgv('project', 'resume', '--all');
      const exitCode = await project(client);

      expect(exitCode).toEqual(0);
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(resumed).toEqual([]);
      await expect(client.stderr).toOutput(
        `No paused projects in ${team.slug}.`
      );
    });

    it('rejects project names with --all', async () => {
      useUser();

      client.setArgv('project', 'resume', 'site-a', '--all');
      const exitCode = await project(client);

      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput(
        'Use either project names or --all, not both.'
      );
    });

    it('needs --yes and names the team without a terminal', async () => {
      useUser();
      const team = useCurrentTeam();
      useTeamProjects([{ id: 'prj_a', name: 'site-a', paused: true }]);
      const resumed = useUnpause();
      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => undefined) as never);

      client.nonInteractive = true;
      client.setArgv('project', 'resume', '--all', '--non-interactive');
      await project(client);

      expect(exitSpy).toHaveBeenCalledWith(2);
      expect(resumed).toEqual([]);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'confirmation_required',
        userActionRequired: true,
        data: { team: team.slug, projects: [{ id: 'prj_a', name: 'site-a' }] },
      });
      expect(payload.next[0].command).toEqual(
        `vercel project resume --all --non-interactive --yes --scope ${team.slug}`
      );
      expect(payload.next[0].when).toEqual(
        `Only after a human approves resuming production traffic for 1 project in ${team.slug}`
      );
    });

    it('needs a team named with --scope for --yes without a terminal', async () => {
      useUser();
      useCurrentTeam();
      const requests = useProjectList([
        { id: 'prj_a', name: 'site-a', paused: true },
      ]);
      const resumed = useUnpause();
      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => undefined) as never);

      client.nonInteractive = true;
      client.setArgv(
        'project',
        'resume',
        '--all',
        '--yes',
        '--non-interactive'
      );
      await project(client);

      expect(exitSpy).toHaveBeenCalledWith(2);
      expect(resumed).toEqual([]);
      // It refuses before reading any projects.
      expect(requests).toEqual([]);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'missing_scope',
      });
      expect(payload.next[0].command).toEqual(
        'vercel project resume --all --yes --non-interactive --scope <TEAM>'
      );
    });

    it('resumes with --yes and --scope without a terminal', async () => {
      useUser();
      const team = useCurrentTeam();
      useTeamProjects([
        { id: 'prj_a', name: 'site-a', paused: true },
        { id: 'prj_b', name: 'site-b', paused: true },
      ]);
      const resumed = useUnpause();

      client.nonInteractive = true;
      client.setArgv(
        'project',
        'resume',
        '--all',
        '--yes',
        '--scope',
        team.slug,
        '--non-interactive'
      );
      const exitCode = await project(client);

      expect(exitCode).toEqual(0);
      expect(resumed).toEqual(['prj_a', 'prj_b']);
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
        results: [
          { id: 'prj_a', name: 'site-a', outcome: 'resumed' },
          { id: 'prj_b', name: 'site-b', outcome: 'resumed' },
        ],
        summary: { succeeded: 2, failed: 0, skipped: 0, unknown: 0 },
      });
    });

    it('resumes with --yes when VERCEL_ORG_ID names the team', async () => {
      useUser();
      const team = useCurrentTeam();
      process.env.VERCEL_ORG_ID = team.id;
      useTeamProjects([{ id: 'prj_a', name: 'site-a', paused: true }]);
      const resumed = useUnpause();

      client.stdin.isTTY = false;
      client.setArgv('project', 'resume', '--all', '--yes');
      const exitCode = await project(client);

      expect(exitCode).toEqual(0);
      expect(resumed).toEqual(['prj_a']);
    });

    it('still asks in a terminal when --yes comes without a named team', async () => {
      useUser();
      useCurrentTeam();
      useTeamProjects([{ id: 'prj_a', name: 'site-a', paused: true }]);
      const resumed = useUnpause();
      const confirmSpy = vi
        .spyOn(client.input, 'confirm')
        .mockResolvedValue(true);

      client.setArgv('project', 'resume', '--all', '--yes');
      const exitCode = await project(client);

      expect(exitCode).toEqual(0);
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(resumed).toEqual(['prj_a']);
    });
  });

  describe('more than 100 projects paused at the same moment', () => {
    // The API can only list the first 100 of them.
    const tied = Array.from({ length: 150 }, (_, i) => ({
      id: `prj_${i}`,
      name: `site-${i}`,
      paused: true,
      updatedAt: 500,
    }));

    function useUnpause() {
      const resumed: string[] = [];
      client.scenario.post('/v1/projects/:projectId/unpause', (req, res) => {
        resumed.push(req.params.projectId);
        res.status(200).end();
      });
      return resumed;
    }

    function useAcme() {
      const team = useTeam('team_acme');
      team.slug = 'acme';
      client.config.currentTeam = team.id;
    }

    it('says some may be missing and how to resume the rest', async () => {
      useUser();
      useAcme();
      useProjectList(tied);
      const resumed = useUnpause();

      client.setArgv('project', 'resume', '--all', '--yes', '--json');
      const exitCode = await project(client);

      expect(exitCode).toEqual(1);
      expect(resumed).toHaveLength(100);
      const result = JSON.parse(client.stdout.getFullOutput());
      expect(result.summary).toEqual({
        succeeded: 100,
        failed: 0,
        skipped: 0,
        unknown: 0,
      });
      expect(result.warnings).toEqual([
        {
          reason: 'incomplete_results',
          message: expect.stringContaining(
            'Some paused projects may be missing.'
          ),
        },
      ]);
      expect(result.next).toEqual([
        {
          command: 'vercel project resume --all --scope acme --yes',
          when: 'To resume paused projects this run may have missed',
        },
      ]);
    });

    it('does not report the run as complete in a terminal', async () => {
      useUser();
      useAcme();
      useProjectList(tied);
      useUnpause();
      vi.spyOn(client.input, 'confirm').mockResolvedValue(true);

      client.setArgv('project', 'resume', '--all');
      const exitCode = await project(client);

      expect(exitCode).toEqual(1);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Resumed         100 projects');
      expect(stderr).not.toContain('✓');
      expect(stderr).toContain('Some paused projects may be missing.');
      expect(stderr).toContain(
        'Run this again to resume the rest:\n    vercel project resume --all --scope acme'
      );
    });

    it('warns in project list --paused', async () => {
      useUser();
      useAcme();
      useProjectList(tied);

      client.setArgv('project', 'ls', '--paused', '--json');
      const exitCode = await project(client);

      expect(exitCode).toEqual(0);
      const result = JSON.parse(client.stdout.getFullOutput());
      expect(result.projects).toHaveLength(100);
      expect(result.pagination.next).toEqual(null);
      expect(result.warnings).toEqual([
        {
          reason: 'incomplete_results',
          message: expect.stringContaining(
            'Some paused projects may be missing.'
          ),
        },
      ]);
    });
  });

  describe('which team', () => {
    let saved: ReturnType<typeof useTeam>;
    let linked: ReturnType<typeof useTeam>;

    /** The saved team is not the team the folder is linked to. */
    async function useLinkedFolder() {
      linked = useTeam('team_linked');
      linked.slug = 'linked-team';
      saved = useTeam('team_saved');
      saved.slug = 'saved-team';
      client.config.currentTeam = saved.id;
      const cwd = setupTmpDir();
      await outputFile(
        join(cwd, '.vercel', 'project.json'),
        JSON.stringify({ orgId: linked.id, projectId: 'prj_linked' })
      );
      client.cwd = cwd;
    }

    it('looks up named projects in the saved team, like one project', async () => {
      useUser();
      await useLinkedFolder();
      const teams: unknown[] = [];
      client.scenario.get('/v9/projects/:idOrName', (req, res) => {
        teams.push(req.query.teamId);
        res.json({
          ...defaultProject,
          id: `prj_${req.params.idOrName}`,
          name: req.params.idOrName,
          paused: true,
        });
      });
      client.scenario.post('/v1/projects/:projectId/unpause', (req, res) => {
        teams.push(req.query.teamId);
        res.status(200).end();
      });

      client.setArgv('project', 'resume', 'site-a', 'site-b', '--yes');
      const exitCode = await project(client);

      expect(exitCode).toEqual(0);
      expect(teams).toEqual([saved.id, saved.id, saved.id, saved.id]);
    });

    it('resumes --all in the linked team and names it in the retry command', async () => {
      useUser();
      await useLinkedFolder();
      const requests = useProjectList([
        { id: 'prj_a', name: 'site-a', paused: true, updatedAt: 200 },
        { id: 'prj_b', name: 'site-b', paused: true, updatedAt: 100 },
      ]);
      client.scenario.post('/v1/projects/:projectId/unpause', (req, res) => {
        if (req.params.projectId === 'prj_b') {
          return res.status(403).json({
            error: { code: 'forbidden', message: 'Not allowed.' },
          });
        }
        res.status(200).end();
      });
      vi.spyOn(client.input, 'confirm').mockResolvedValue(true);

      client.setArgv('project', 'resume', '--all');
      const exitCode = await project(client);

      expect(exitCode).toEqual(1);
      expect(requests[0]).toMatchObject({ teamId: linked.id });
      expect(client.stderr.getFullOutput()).toContain(
        'vercel project resume prj_b --scope linked-team'
      );
    });
  });

  describe('unpause failures', () => {
    function useTwoPaused() {
      useUser();
      useProject({
        ...defaultProject,
        id: 'prj_a',
        name: 'site-a',
        paused: true,
      });
      useProject({
        ...defaultProject,
        id: 'prj_b',
        name: 'site-b',
        paused: true,
      });
    }

    it.each([
      502, 503, 504,
    ])('reports a %s from the proxy as unknown, since it may have resumed', async status => {
      useTwoPaused();
      client.scenario.post('/v1/projects/:projectId/unpause', (req, res) => {
        if (req.params.projectId === 'prj_b') {
          return res.status(status).json({
            error: { code: 'gateway', message: 'Bad gateway.' },
          });
        }
        res.status(200).end();
      });

      client.setArgv(
        'project',
        'resume',
        'site-a',
        'site-b',
        '--yes',
        '--json'
      );
      const exitCode = await project(client);

      expect(exitCode).toEqual(1);
      const result = JSON.parse(client.stdout.getFullOutput());
      expect(result.results[1]).toMatchObject({
        id: 'prj_b',
        outcome: 'unknown',
        error: { code: 'unknown_outcome' },
      });
    });

    it('reports an error the API itself returned as failed', async () => {
      useTwoPaused();
      client.scenario.post('/v1/projects/:projectId/unpause', (req, res) => {
        if (req.params.projectId === 'prj_b') {
          return res.status(500).json({
            error: {
              code: 'error_unblocking_deployment',
              message: 'Failed to unblock the deployment.',
            },
          });
        }
        res.status(200).end();
      });

      client.setArgv(
        'project',
        'resume',
        'site-a',
        'site-b',
        '--yes',
        '--json'
      );
      const exitCode = await project(client);

      expect(exitCode).toEqual(1);
      const result = JSON.parse(client.stdout.getFullOutput());
      expect(result.results[1]).toMatchObject({
        id: 'prj_b',
        outcome: 'failed',
        error: { code: 'error_unblocking_deployment' },
      });
    });

    it('puts the retry command in the JSON', async () => {
      useTwoPaused();
      const team = useTeam('team_acme');
      team.slug = 'acme';
      client.config.currentTeam = team.id;
      client.scenario.post('/v1/projects/:projectId/unpause', (_req, res) => {
        res.status(403).json({
          error: { code: 'forbidden', message: 'Not allowed.' },
        });
      });

      client.setArgv(
        'project',
        'resume',
        'site-a',
        'site-b',
        '--yes',
        '--json'
      );
      const exitCode = await project(client);

      expect(exitCode).toEqual(1);
      const result = JSON.parse(client.stdout.getFullOutput());
      expect(result.next).toEqual([
        {
          command: 'vercel project resume prj_a prj_b --yes --scope acme',
          when: "To retry the projects that didn't resume. Resuming again is safe.",
        },
      ]);
      expect(result.warnings).toBeUndefined();
    });

    it('names the team once when the run used --team', async () => {
      useTwoPaused();
      const team = useTeam('team_acme');
      team.slug = 'acme';
      // The CLI's entry point turns `--team acme` into the current team.
      client.config.currentTeam = team.id;
      client.scenario.post('/v1/projects/:projectId/unpause', (_req, res) => {
        res.status(403).json({
          error: { code: 'forbidden', message: 'Not allowed.' },
        });
      });

      client.setArgv(
        'project',
        'resume',
        'site-a',
        'site-b',
        '--team',
        'acme',
        '--yes',
        '--json'
      );
      const exitCode = await project(client);

      expect(exitCode).toEqual(1);
      const result = JSON.parse(client.stdout.getFullOutput());
      expect(result.next[0].command).toEqual(
        'vercel project resume prj_a prj_b --yes --scope acme'
      );
    });
  });

  describe('resuming many projects', () => {
    it('resumes five at a time and keeps the order', async () => {
      useUser();
      const team = useTeam('team_acme');
      team.slug = 'acme';
      client.config.currentTeam = team.id;
      useProjectList(
        Array.from({ length: 12 }, (_, i) => ({
          id: `prj_${i}`,
          name: `site-${i}`,
          paused: true,
          updatedAt: 1000 - i,
        }))
      );
      let inFlight = 0;
      let mostInFlight = 0;
      client.scenario.post('/v1/projects/:projectId/unpause', (_req, res) => {
        inFlight++;
        mostInFlight = Math.max(mostInFlight, inFlight);
        setTimeout(() => {
          inFlight--;
          res.status(200).end();
        }, 20);
      });

      client.setArgv('project', 'resume', '--all', '--yes', '--json');
      const exitCode = await project(client);

      expect(exitCode).toEqual(0);
      expect(mostInFlight).toEqual(5);
      const result = JSON.parse(client.stdout.getFullOutput());
      expect(result.results.map((r: { id: string }) => r.id)).toEqual(
        Array.from({ length: 12 }, (_, i) => `prj_${i}`)
      );
    });
  });

  describe('--all --yes in a personal account', () => {
    afterEach(() => {
      delete process.env.VERCEL_ORG_ID;
    });

    function useTeamList(teams: Array<{ id: string; slug: string }>) {
      client.scenario.get('/v1/teams', (_req, res) => {
        res.json({ teams });
      });
    }

    function useUnpause() {
      const resumed: string[] = [];
      client.scenario.post('/v1/projects/:projectId/unpause', (req, res) => {
        resumed.push(req.params.projectId);
        res.status(200).end();
      });
      return resumed;
    }

    it('runs when VERCEL_ORG_ID names the user', async () => {
      useUser({ id: 'user_hobby', username: 'jane' });
      useTeamList([{ id: 'team_other', slug: 'other' }]);
      process.env.VERCEL_ORG_ID = 'user_hobby';
      useProjectList([{ id: 'prj_a', name: 'site-a', paused: true }]);
      const resumed = useUnpause();

      client.stdin.isTTY = false;
      client.setArgv('project', 'resume', '--all', '--yes');
      const exitCode = await project(client);

      expect(exitCode).toEqual(0);
      expect(resumed).toEqual(['prj_a']);
    });

    it('runs when the user has no teams', async () => {
      useUser({ id: 'user_hobby', username: 'jane' });
      useTeamList([]);
      useProjectList([{ id: 'prj_a', name: 'site-a', paused: true }]);
      const resumed = useUnpause();

      client.stdin.isTTY = false;
      client.setArgv('project', 'resume', '--all', '--yes');
      const exitCode = await project(client);

      expect(exitCode).toEqual(0);
      expect(resumed).toEqual(['prj_a']);
    });

    it('needs --scope when the user also has teams', async () => {
      useUser({ id: 'user_hobby', username: 'jane' });
      useTeamList([{ id: 'team_other', slug: 'other' }]);
      const requests = useProjectList([
        { id: 'prj_a', name: 'site-a', paused: true },
      ]);
      const resumed = useUnpause();

      client.stdin.isTTY = false;
      client.setArgv('project', 'resume', '--all', '--yes');
      const exitCode = await project(client);

      expect(exitCode).toEqual(2);
      expect(resumed).toEqual([]);
      expect(requests).toEqual([]);
      expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
        reason: 'missing_scope',
      });
    });
  });
});
