import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { client } from '../../../mocks/client';
import project from '../../../../src/commands/project';
import { useProject } from '../../../mocks/project';
import { defaultProject } from '../../../mocks/project';

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
    it('adds a member by email and sends the expected request body', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });

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

    it('rejects an invalid role without calling the API', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
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
  });

  describe('remove', () => {
    function useMembersList(members: unknown[]) {
      client.scenario.get('/v1/projects/:idOrName/members', (_req, res) => {
        res.json({ members, pagination: {} });
      });
    }

    it('removes a member by uid after resolving via the members listing', async () => {
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
        'octocat@example.com',
        '--yes'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(deletedUid).toBe('user_1');
      await expect(client.stderr).toOutput('Removed octocat from my-project.');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:members', value: 'members remove' },
        { key: 'argument:project', value: '[REDACTED]' },
        { key: 'argument:member', value: '[REDACTED]' },
        { key: 'flag:yes', value: 'TRUE' },
      ]);
    });

    it('removes a member after interactive confirmation', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });
      useMembersList([{ uid: 'user_1', username: 'octocat' }]);
      client.scenario.delete(
        '/v1/projects/:idOrName/members/:uid',
        (_req, res) => {
          res.json({ id: 'prj_123' });
        }
      );

      client.setArgv('project', 'members', 'remove', 'my-project', 'octocat');
      const pending = project(client);
      await expect(client.stderr).toOutput('Remove');
      client.stdin.write('y\n');
      const exitCode = await pending;
      expect(exitCode).toBe(0);
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
        'nobody@example.com',
        '--yes'
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

    describe('--non-interactive', () => {
      afterEach(() => {
        vi.restoreAllMocks();
        client.nonInteractive = false;
      });

      it('requires --yes and outputs confirmation_required JSON', async () => {
        useProject({
          ...defaultProject,
          id: 'prj_123',
          name: 'my-project',
        });
        useMembersList([{ uid: 'user_1', username: 'octocat' }]);

        vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
          throw new Error(`exit:${code ?? 0}`);
        }) as () => never);

        client.nonInteractive = true;
        client.setArgv(
          'project',
          'members',
          'remove',
          'my-project',
          'octocat',
          '--non-interactive'
        );

        await expect(project(client)).rejects.toThrow('exit:1');

        const payload = JSON.parse(client.stdout.getFullOutput().trim());
        expect(payload).toMatchObject({
          status: 'action_required',
          reason: 'confirmation_required',
        });
      });
    });
  });
});
