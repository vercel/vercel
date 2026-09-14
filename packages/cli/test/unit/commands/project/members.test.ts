import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { client } from '../../../mocks/client';
import project from '../../../../src/commands/project';
import { useProject } from '../../../mocks/project';
import { defaultProject } from '../../../mocks/project';
import { teamCache } from '../../../../src/util/teams/get-team-by-id-or-slug';

describe('project members', () => {
  it('lists project members in table output', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.get('/v1/projects/:idOrName/members', (req, res) => {
      expect(req.params.idOrName).toBe('prj_123');
      res.json({
        members: [
          {
            uid: 'user_1',
            username: 'one',
            role: 'PROJECT_VIEWER',
            computedProjectRole: 'PROJECT_VIEWER',
            teamRole: 'MEMBER',
          },
        ],
        pagination: {},
      });
    });

    client.setArgv('project', 'members', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('user_1');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:members',
        value: 'members',
      },
    ]);
  });

  it('outputs valid JSON with --format json', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.get('/v1/projects/:idOrName/members', (_req, res) => {
      res.json({
        members: [
          {
            uid: 'user_1',
            username: 'one',
            role: 'PROJECT_VIEWER',
            computedProjectRole: 'PROJECT_VIEWER',
            teamRole: 'MEMBER',
          },
        ],
        pagination: {},
      });
    });

    client.setArgv('project', 'members', 'my-project', '--format', 'json');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);

    const output = client.stdout.getFullOutput();
    const jsonOutput = JSON.parse(output);
    expect(Array.isArray(jsonOutput.members)).toBe(true);
    expect(jsonOutput.members[0].uid).toBe('user_1');
  });

  it('validates limit range', async () => {
    client.setArgv('project', 'members', '--limit', '0');
    const exitCode = await project(client);
    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput(
      '`--limit` must be a number between 1 and 100.'
    );
  });

  it('continues from --next and prints the next command', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.get('/v1/projects/:idOrName/members', (req, res) => {
      expect(req.query.limit).toBe('5');
      expect(req.query.until).toBe('1584722256178');
      expect(req.query.next).toBeUndefined();
      res.json({
        members: [],
        pagination: { next: 1584722257000 },
      });
    });

    client.setArgv(
      'project',
      'members',
      'my-project',
      '--limit',
      '5',
      '--search',
      'Jane Doe',
      '--next',
      '1584722256178'
    );
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput(
      "project members my-project --limit 5 --search 'Jane Doe' --next 1584722257000"
    );
  });

  describe('--non-interactive', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      client.nonInteractive = false;
    });

    it('outputs error JSON when the members API returns 403', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });

      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.scenario.get('/v1/projects/:idOrName/members', (_req, res) => {
        res.status(403).json({
          error: { code: 'forbidden', message: 'Members list forbidden.' },
        });
      });

      client.nonInteractive = true;
      client.setArgv('project', 'members', 'my-project', '--non-interactive');

      await expect(project(client)).rejects.toThrow('exit:1');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'forbidden',
        message: 'Members list forbidden.',
      });
    });

    it('outputs link_required JSON when no project name and directory is not linked', async () => {
      const emptyDir = mkdtempSync(join(tmpdir(), 'vc-cli-members-unlinked-'));
      const prevCwd = client.cwd;
      client.cwd = emptyDir;

      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv('project', 'members', '--non-interactive');

      try {
        await expect(project(client)).rejects.toThrow('exit:1');

        const payload = JSON.parse(client.stdout.getFullOutput().trim());
        expect(payload).toMatchObject({
          status: 'error',
          reason: 'link_required',
        });
        expect(payload.message).toMatch(/linked|project name/i);
        expect(
          payload.next?.some((n: { command: string }) => /link/.test(n.command))
        ).toBe(true);
      } finally {
        client.cwd = prevCwd;
        rmSync(emptyDir, { recursive: true, force: true });
      }
    });
  });

  describe('add', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      client.nonInteractive = false;
      client.stdin.isTTY = true;
      client.config.currentTeam = undefined;
    });

    function useScopeWithPlan(plan: string) {
      teamCache.clear();
      client.config.currentTeam = 'team_paid';
      client.scenario.get('/v2/user', (_req, res) => {
        res.json({ user: { id: 'user_123', username: 'testuser' } });
      });
      client.scenario.get('/teams/team_paid', (_req, res) => {
        res.json({
          id: 'team_paid',
          slug: 'paid-team',
          name: 'Paid Team',
          billing: { plan, period: { start: 0, end: 0 }, addons: [] },
        });
      });
    }

    it('adds a member by email and sends the expected request body', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });
      useScopeWithPlan('pro');
      vi.spyOn(client.input, 'confirm').mockResolvedValue(true);

      let received: Record<string, unknown> | undefined;
      client.scenario.post('/v1/projects/:idOrName/members', (req, res) => {
        expect(req.params.idOrName).toBe('prj_123');
        received = req.body;
        res.json({ id: 'prj_123' });
      });

      client.setArgv(
        'project',
        'members',
        'add',
        'my-project',
        'user@example.com',
        '--role',
        'PROJECT_VIEWER'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(received).toEqual({
        email: 'user@example.com',
        role: 'PROJECT_VIEWER',
      });
      await expect(client.stderr).toOutput(
        'Added user@example.com to my-project as PROJECT_VIEWER.'
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:members', value: 'members add' },
        { key: 'argument:project', value: '[REDACTED]' },
        { key: 'argument:member', value: '[REDACTED]' },
        { key: 'option:role', value: 'PROJECT_VIEWER' },
      ]);
    });

    it('sends a username field for a non-email, non-uid identifier', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });
      useScopeWithPlan('pro');
      vi.spyOn(client.input, 'confirm').mockResolvedValue(true);

      let received: Record<string, unknown> | undefined;
      client.scenario.post('/v1/projects/:idOrName/members', (_req, res) => {
        received = _req.body;
        res.json({ id: 'prj_123' });
      });

      client.setArgv(
        'project',
        'members',
        'add',
        'my-project',
        'octocat',
        '--role',
        'admin'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(received).toEqual({ username: 'octocat', role: 'ADMIN' });
    });

    it('sends a uid field for a long alphanumeric identifier', async () => {
      useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
      useScopeWithPlan('pro');
      vi.spyOn(client.input, 'confirm').mockResolvedValue(true);

      let received: Record<string, unknown> | undefined;
      client.scenario.post('/v1/projects/:idOrName/members', (req, res) => {
        received = req.body;
        res.json({ id: 'prj_123' });
      });

      const uid = 'AbCdEf1234567890AbCdEf12';
      client.setArgv(
        'project',
        'members',
        'add',
        'my-project',
        uid,
        '--role',
        'PROJECT_VIEWER'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(received).toEqual({ uid, role: 'PROJECT_VIEWER' });
    });

    it('rejects an invalid role without calling the API', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });

      let posted = false;
      client.scenario.post('/v1/projects/:idOrName/members', (_req, res) => {
        posted = true;
        res.json({ id: 'prj_123' });
      });

      client.setArgv(
        'project',
        'members',
        'add',
        'my-project',
        'user@example.com',
        '--role',
        'OWNER'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('`--role` must be one of:');
      expect(posted).toBe(false);
    });

    it('requires a role', async () => {
      client.setArgv(
        'project',
        'members',
        'add',
        'my-project',
        'user@example.com'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('`--role` is required.');
    });

    it('errors when arguments are missing', async () => {
      client.setArgv('project', 'members', 'add', 'my-project');
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Invalid number of arguments.');
    });

    it('prompts before adding a non-viewer member on a Pro team', async () => {
      useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
      useScopeWithPlan('pro');
      const confirmSpy = vi
        .spyOn(client.input, 'confirm')
        .mockResolvedValue(true);

      let received: Record<string, unknown> | undefined;
      client.scenario.post('/v1/projects/:idOrName/members', (_req, res) => {
        received = _req.body;
        res.json({ id: 'prj_123' });
      });

      client.setArgv(
        'project',
        'members',
        'add',
        'my-project',
        'user@example.com',
        '--role',
        'ADMIN'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(confirmSpy).toHaveBeenCalled();
      expect(received).toEqual({ email: 'user@example.com', role: 'ADMIN' });
    });

    it('prompts before adding a viewer on a Pro team', async () => {
      useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
      useScopeWithPlan('pro');
      const confirmSpy = vi
        .spyOn(client.input, 'confirm')
        .mockResolvedValue(true);

      let posted = false;
      client.scenario.post('/v1/projects/:idOrName/members', (_req, res) => {
        posted = true;
        res.json({ id: 'prj_123' });
      });

      client.setArgv(
        'project',
        'members',
        'add',
        'my-project',
        'user@example.com',
        '--role',
        'PROJECT_VIEWER'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(confirmSpy).toHaveBeenCalled();
      expect(posted).toBe(true);
    });

    it('does not add the member when the user declines confirmation', async () => {
      useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
      useScopeWithPlan('pro');
      vi.spyOn(client.input, 'confirm').mockResolvedValue(false);

      let posted = false;
      client.scenario.post('/v1/projects/:idOrName/members', (_req, res) => {
        posted = true;
        res.json({ id: 'prj_123' });
      });

      client.setArgv(
        'project',
        'members',
        'add',
        'my-project',
        'user@example.com',
        '--role',
        'ADMIN'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(posted).toBe(false);
      await expect(client.stderr).toOutput('Canceled');
    });

    it('refuses to add a member non-interactively and emits action_required', async () => {
      useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
      useScopeWithPlan('pro');
      client.nonInteractive = true;
      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => undefined) as never);

      let posted = false;
      client.scenario.post('/v1/projects/:idOrName/members', (_req, res) => {
        posted = true;
        res.json({ id: 'prj_123' });
      });

      client.setArgv(
        'project',
        'members',
        'add',
        'my-project',
        'user@example.com',
        '--role',
        'ADMIN',
        '--non-interactive'
      );
      await project(client);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'confirmation_required',
        action: 'confirmation_required',
        userActionRequired: true,
      });
      expect(payload.next?.[0]?.command).toContain('project members add');
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(posted).toBe(false);

      exitSpy.mockRestore();
    });

    it('refuses adding a member on a hobby plan with upgrade guidance', async () => {
      useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
      useScopeWithPlan('hobby');
      const confirmSpy = vi.spyOn(client.input, 'confirm');

      let posted = false;
      client.scenario.post('/v1/projects/:idOrName/members', (_req, res) => {
        posted = true;
        res.json({ id: 'prj_123' });
      });

      client.setArgv(
        'project',
        'members',
        'add',
        'my-project',
        'user@example.com',
        '--role',
        'ADMIN'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(posted).toBe(false);
      await expect(client.stderr).toOutput('Pro or Enterprise team');
    });

    it('emits plan_upgrade_required non-interactively on a hobby plan', async () => {
      useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
      useScopeWithPlan('hobby');
      client.nonInteractive = true;
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('__exit__');
      }) as never);

      let posted = false;
      client.scenario.post('/v1/projects/:idOrName/members', (_req, res) => {
        posted = true;
        res.json({ id: 'prj_123' });
      });

      client.setArgv(
        'project',
        'members',
        'add',
        'my-project',
        'user@example.com',
        '--role',
        'ADMIN',
        '--non-interactive'
      );
      await expect(project(client)).rejects.toThrow('__exit__');

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'plan_upgrade_required',
      });
      expect(posted).toBe(false);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('refuses a viewer seat on a hobby plan too', async () => {
      useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
      useScopeWithPlan('hobby');

      let posted = false;
      client.scenario.post('/v1/projects/:idOrName/members', (_req, res) => {
        posted = true;
        res.json({ id: 'prj_123' });
      });

      client.setArgv(
        'project',
        'members',
        'add',
        'my-project',
        'user@example.com',
        '--role',
        'PROJECT_VIEWER'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      expect(posted).toBe(false);
      await expect(client.stderr).toOutput('Pro or Enterprise team');
    });

    it('refuses adding a member on an oss plan', async () => {
      useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
      useScopeWithPlan('oss');

      let posted = false;
      client.scenario.post('/v1/projects/:idOrName/members', (_req, res) => {
        posted = true;
        res.json({ id: 'prj_123' });
      });

      client.setArgv(
        'project',
        'members',
        'add',
        'my-project',
        'user@example.com',
        '--role',
        'ADMIN'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      expect(posted).toBe(false);
    });

    it('translates the not-a-confirmed-member API error into invite guidance', async () => {
      useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
      useScopeWithPlan('pro');
      vi.spyOn(client.input, 'confirm').mockResolvedValue(true);

      client.scenario.post('/v1/projects/:idOrName/members', (_req, res) => {
        res.status(400).json({
          error: {
            code: 'bad_request',
            message: 'The provided user is not a confirmed member of the team.',
          },
        });
      });

      client.setArgv(
        'project',
        'members',
        'add',
        'my-project',
        'someone-new@example.com',
        '--role',
        'ADMIN'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('must be a confirmed member');
      await expect(client.stderr).toOutput('teams invite');
    });

    it('translates the invalid-role-combination API error into role-mapping guidance', async () => {
      useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
      useScopeWithPlan('pro');
      vi.spyOn(client.input, 'confirm').mockResolvedValue(true);

      client.scenario.post('/v1/projects/:idOrName/members', (_req, res) => {
        res.status(400).json({
          error: {
            code: 'invalid_team_and_project_role_combination',
            message:
              'Invalid role combination. Team role MEMBER cannot be assigned project role PROJECT_VIEWER',
          },
        });
      });

      client.setArgv(
        'project',
        'members',
        'add',
        'my-project',
        'user@example.com',
        '--role',
        'PROJECT_VIEWER'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput(
        'CONTRIBUTOR → PROJECT_VIEWER, PROJECT_DEVELOPER, ADMIN, PROJECT_GUEST'
      );
      await expect(client.stderr).toOutput(
        'Team Members and Owners already have access'
      );
    });

    it('emits invalid_role_combination JSON for the bad-combination error with --json', async () => {
      useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
      useScopeWithPlan('pro');
      vi.spyOn(client.input, 'confirm').mockResolvedValue(true);

      client.scenario.post('/v1/projects/:idOrName/members', (_req, res) => {
        res.status(400).json({
          error: {
            code: 'invalid_team_and_project_role_combination',
            message:
              'Invalid role combination. Team role MEMBER cannot be assigned project role ADMIN',
          },
        });
      });

      client.setArgv(
        'project',
        'members',
        'add',
        'my-project',
        'user@example.com',
        '--role',
        'ADMIN',
        '--json'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'invalid_role_combination',
      });
      expect(payload.message).toContain('CONTRIBUTOR → PROJECT_VIEWER/');
    });

    it('emits JSON error on a plain non-TTY pipe without --non-interactive', async () => {
      client.stdin.isTTY = false;
      client.setArgv(
        'project',
        'members',
        'add',
        'my-project',
        'user@example.com'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'missing_arguments',
      });
    });

    it('refuses to add a member on a plain non-TTY pipe', async () => {
      useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
      useScopeWithPlan('pro');
      client.stdin.isTTY = false;

      let posted = false;
      client.scenario.post('/v1/projects/:idOrName/members', (_req, res) => {
        posted = true;
        res.json({ id: 'prj_123' });
      });

      client.setArgv(
        'project',
        'members',
        'add',
        'my-project',
        'user@example.com',
        '--role',
        'PROJECT_VIEWER'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      expect(posted).toBe(false);
      expect(client.stdout.getFullOutput().trim()).toBe('');
      await expect(client.stderr).toOutput(
        'This command must be run interactively'
      );
    });
  });

  describe('remove', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      client.nonInteractive = false;
      client.stdin.isTTY = true;
    });

    interface MockMember {
      uid: string;
      username?: string;
      email?: string;
      name?: string;
    }

    function useMembersList(members: MockMember[]) {
      client.scenario.get('/v1/projects/:idOrName/members', (req, res) => {
        const search =
          typeof req.query.search === 'string'
            ? req.query.search.toLowerCase()
            : undefined;
        const filtered = search
          ? members.filter(
              m =>
                m.username?.toLowerCase().includes(search) ||
                m.email?.toLowerCase().includes(search) ||
                m.name?.toLowerCase().includes(search)
            )
          : members;
        res.json({ members: filtered, pagination: {} });
      });
    }

    it('removes a member by email after resolving via the members listing', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });
      useMembersList([
        { uid: 'user_1', username: 'octocat', email: 'octocat@example.com' },
      ]);

      let deletedUid: string | undefined;
      client.scenario.delete(
        '/v1/projects/:idOrName/members/:uid',
        (req, res) => {
          expect(req.params.idOrName).toBe('prj_123');
          deletedUid = req.params.uid;
          res.json({ id: 'prj_123' });
        }
      );

      client.setArgv(
        'project',
        'members',
        'remove',
        'my-project',
        'octocat@example.com'
      );
      const exitCode = project(client);
      await expect(client.stderr).toOutput('Remove');
      client.stdin.write('y\n');
      expect(await exitCode).toBe(0);
      expect(deletedUid).toBe('user_1');
      await expect(client.stderr).toOutput('Removed octocat from my-project.');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:members', value: 'members remove' },
        { key: 'argument:project', value: '[REDACTED]' },
        { key: 'argument:member', value: '[REDACTED]' },
      ]);
    });

    it('removes a member by uid (not matchable via the server search)', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });
      useMembersList([
        { uid: 'user_1', username: 'octocat', email: 'octocat@example.com' },
      ]);

      let deletedUid: string | undefined;
      client.scenario.delete(
        '/v1/projects/:idOrName/members/:uid',
        (req, res) => {
          deletedUid = req.params.uid;
          res.json({ id: 'prj_123' });
        }
      );

      client.setArgv('project', 'members', 'remove', 'my-project', 'user_1');
      const exitCode = project(client);
      await expect(client.stderr).toOutput('Remove');
      client.stdin.write('y\n');
      expect(await exitCode).toBe(0);
      expect(deletedUid).toBe('user_1');
      await expect(client.stderr).toOutput('Removed octocat from my-project.');
    });

    it('rejects the removed --yes flag as an unknown option', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });

      let deleted = false;
      client.scenario.delete(
        '/v1/projects/:idOrName/members/:uid',
        (_req, res) => {
          deleted = true;
          res.json({ id: 'prj_123' });
        }
      );

      client.setArgv(
        'project',
        'members',
        'remove',
        'my-project',
        'octocat',
        '--yes'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      expect(deleted).toBe(false);
      await expect(client.stderr).toOutput('unknown or unexpected option');
    });

    it('pages through the members list to resolve a member beyond the first page', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });

      client.scenario.get('/v1/projects/:idOrName/members', (req, res) => {
        if (!req.query.until) {
          res.json({
            members: [{ uid: 'user_0', username: 'first' }],
            pagination: { next: 100 },
          });
        } else {
          expect(req.query.until).toBe('100');
          res.json({
            members: [{ uid: 'user_9', username: 'target' }],
            pagination: {},
          });
        }
      });

      let deletedUid: string | undefined;
      client.scenario.delete(
        '/v1/projects/:idOrName/members/:uid',
        (req, res) => {
          deletedUid = req.params.uid;
          res.json({ id: 'prj_123' });
        }
      );

      client.setArgv('project', 'members', 'remove', 'my-project', 'target');
      const exitCode = project(client);
      await expect(client.stderr).toOutput('Remove');
      client.stdin.write('y\n');
      expect(await exitCode).toBe(0);
      expect(deletedUid).toBe('user_9');
    });

    it('prompts for confirmation and only deletes after a yes', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });
      useMembersList([{ uid: 'user_1', username: 'octocat' }]);

      let deleted = false;
      client.scenario.delete(
        '/v1/projects/:idOrName/members/:uid',
        (_req, res) => {
          deleted = true;
          res.json({ id: 'prj_123' });
        }
      );

      client.setArgv('project', 'members', 'remove', 'my-project', 'octocat');
      const declined = project(client);
      await expect(client.stderr).toOutput('Remove');
      client.stdin.write('n\n');
      expect(await declined).toBe(0);
      await expect(client.stderr).toOutput('Canceled.');
      expect(deleted).toBe(false);

      client.setArgv('project', 'members', 'remove', 'my-project', 'octocat');
      const confirmed = project(client);
      await expect(client.stderr).toOutput('Remove');
      client.stdin.write('y\n');
      expect(await confirmed).toBe(0);
      expect(deleted).toBe(true);
    });

    it('supports the rm alias and tracks members remove telemetry', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });
      useMembersList([{ uid: 'user_1', username: 'octocat' }]);

      let deleted = false;
      client.scenario.delete(
        '/v1/projects/:idOrName/members/:uid',
        (req, res) => {
          deleted = true;
          expect(req.params.uid).toBe('user_1');
          res.json({ id: 'prj_123' });
        }
      );

      client.setArgv('project', 'members', 'rm', 'my-project', 'octocat');
      const exitCode = project(client);
      await expect(client.stderr).toOutput('Remove');
      client.stdin.write('y\n');
      expect(await exitCode).toBe(0);
      expect(deleted).toBe(true);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:members', value: 'members remove' },
        { key: 'argument:project', value: '[REDACTED]' },
        { key: 'argument:member', value: '[REDACTED]' },
      ]);
    });

    it('errors when the member is not part of the project', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });
      useMembersList([{ uid: 'user_1', username: 'octocat' }]);

      client.setArgv(
        'project',
        'members',
        'remove',
        'my-project',
        'nobody@example.com'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('is not a member of my-project.');
    });

    it('errors when arguments are missing', async () => {
      client.setArgv('project', 'members', 'remove', 'my-project');
      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Invalid number of arguments.');
    });

    it('writes a machine-readable error to stdout for a plain non-TTY pipe', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });
      useMembersList([{ uid: 'user_1', username: 'octocat' }]);

      client.nonInteractive = false;
      client.stdin.isTTY = false;
      client.setArgv(
        'project',
        'members',
        'remove',
        'my-project',
        'nobody@example.com'
      );

      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'not_found',
        message: 'nobody@example.com is not a member of my-project.',
      });
    });

    it('outputs confirmation_required JSON and does not delete in non-interactive mode', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });
      useMembersList([{ uid: 'user_1', username: 'octocat' }]);

      let deleted = false;
      client.scenario.delete(
        '/v1/projects/:idOrName/members/:uid',
        (_req, res) => {
          deleted = true;
          res.json({ id: 'prj_123' });
        }
      );

      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);
      client.nonInteractive = true;
      client.setArgv('project', 'members', 'remove', 'my-project', 'octocat');

      await expect(project(client)).rejects.toThrow('exit:1');
      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'confirmation_required',
        action: 'confirmation_required',
        userActionRequired: true,
      });
      expect(deleted).toBe(false);
    });

    it('writes confirmation_required JSON to stdout without a silent exit when stdin is not a TTY', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });
      useMembersList([{ uid: 'user_1', username: 'octocat' }]);

      let deleted = false;
      client.scenario.delete(
        '/v1/projects/:idOrName/members/:uid',
        (_req, res) => {
          deleted = true;
          res.json({ id: 'prj_123' });
        }
      );

      client.nonInteractive = false;
      client.stdin.isTTY = false;
      client.setArgv('project', 'members', 'remove', 'my-project', 'octocat');

      const exitCode = await project(client);
      expect(exitCode).toBe(1);
      expect(deleted).toBe(false);
      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'confirmation_required',
        action: 'confirmation_required',
        userActionRequired: true,
      });
      expect(payload.message).toMatch(/interactive confirmation/i);
    });
  });
});
