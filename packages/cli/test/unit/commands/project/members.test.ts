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
});
