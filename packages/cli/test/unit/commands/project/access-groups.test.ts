import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { client } from '../../../mocks/client';
import project from '../../../../src/commands/project';
import { defaultProject, useProject } from '../../../mocks/project';

describe('project access-groups', () => {
  it('lists project access groups in table output', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.get('/v1/access-groups', (req, res) => {
      expect(req.query.projectId).toBe('prj_123');
      res.json({
        accessGroups: [
          {
            id: 'ag_123',
            name: 'Frontend',
            role: 'PROJECT_DEVELOPER',
          },
        ],
        pagination: { count: 1, next: null },
      });
    });

    client.setArgv('project', 'access-groups', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('ag_123');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:access-groups',
        value: 'access-groups',
      },
    ]);
  });

  it('outputs valid JSON with --format json', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.get('/v1/access-groups', (_req, res) => {
      res.json({
        accessGroups: [
          {
            id: 'ag_123',
            name: 'Frontend',
            role: 'PROJECT_DEVELOPER',
          },
        ],
        pagination: { count: 1, next: null },
      });
    });

    client.setArgv(
      'project',
      'access-groups',
      'my-project',
      '--format',
      'json'
    );
    const exitCode = await project(client);
    expect(exitCode).toBe(0);

    const output = client.stdout.getFullOutput();
    const jsonOutput = JSON.parse(output);
    expect(Array.isArray(jsonOutput.accessGroups)).toBe(true);
    expect(jsonOutput.accessGroups[0].id).toBe('ag_123');
  });

  it('validates limit range', async () => {
    client.setArgv('project', 'access-groups', '--limit', '0');
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

    it('outputs error JSON when the access-groups API returns 403', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });

      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.scenario.get('/v1/access-groups', (_req, res) => {
        res.status(403).json({
          error: {
            code: 'forbidden',
            message: "You don't have permission to list the access group.",
          },
        });
      });

      client.nonInteractive = true;
      client.setArgv(
        'project',
        'access-groups',
        'my-project',
        '--non-interactive'
      );

      await expect(project(client)).rejects.toThrow('exit:1');

      const stdout = client.stdout.getFullOutput().trim();
      const payload = JSON.parse(stdout);
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'forbidden',
        message: "You don't have permission to list the access group.",
      });
    });

    it('outputs link_required JSON when no project name and directory is not linked', async () => {
      const emptyDir = mkdtempSync(join(tmpdir(), 'vc-cli-ag-unlinked-'));
      const prevCwd = client.cwd;
      client.cwd = emptyDir;

      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv('project', 'access-groups', '--non-interactive');

      try {
        await expect(project(client)).rejects.toThrow('exit:1');

        const payload = JSON.parse(client.stdout.getFullOutput().trim());
        expect(payload).toMatchObject({
          status: 'error',
          reason: 'link_required',
        });
        expect(
          payload.next?.some((n: { command: string }) =>
            /access-groups/.test(n.command)
          )
        ).toBe(true);
      } finally {
        client.cwd = prevCwd;
        rmSync(emptyDir, { recursive: true, force: true });
      }
    });
  });
});
