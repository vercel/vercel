import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import project from '../../../../src/commands/project';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { defaultProject, useProject } from '../../../mocks/project';
import { client } from '../../../mocks/client';

describe('project access-groups', () => {
  describe('invalid argument', () => {
    it('errors', async () => {
      useUser();
      client.setArgv('project', 'access-groups', 'a', 'b');
      const exitCode = await project(client);

      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput('Invalid number of arguments');
    });
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'project';
      const subcommand = 'access-groups';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = project(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  it('prints a table with id, slug, and role when the API returns extended fields', async () => {
    useUser();
    useTeams('team_dummy');
    const { project: proj } = useProject({
      ...defaultProject,
      name: 'test_project',
    });
    client.scenario.get('/v1/access-groups', (req, res) => {
      expect(req.query.projectId).toBe(proj.id);
      res.json({
        accessGroups: [
          {
            accessGroupId: 'ag_1',
            name: 'Engineering',
            slug: 'engineering',
            role: 'PROJECT_VIEWER',
          },
        ],
        pagination: { count: 1, next: null },
      });
    });

    client.setArgv('project', 'access-groups', proj.name!);
    const exitCode = await project(client);
    expect(exitCode).toEqual(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('Engineering');
    expect(out).toContain('ag_1');
    expect(out).toContain('engineering');
    expect(out).toContain('PROJECT_VIEWER');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:access-groups',
        value: 'access-groups',
      },
    ]);
  });

  it('lists project access groups when the API returns id-based rows', async () => {
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

  it('writes JSON to stdout with --format json', async () => {
    useUser();
    useTeams('team_dummy');
    const { project: proj } = useProject({
      ...defaultProject,
      name: 'test_project',
    });
    client.scenario.get('/v1/access-groups', (_req, res) => {
      res.json({
        accessGroups: [{ accessGroupId: 'ag_x', name: 'Only' }],
        pagination: {},
      });
    });

    client.setArgv('project', 'access-groups', proj.name!, '--format', 'json');
    const exitCode = await project(client);
    expect(exitCode).toEqual(0);
    const parsed = JSON.parse(client.stdout.getFullOutput().trim());
    expect(parsed.accessGroups).toHaveLength(1);
    expect(parsed.accessGroups[0].accessGroupId).toBe('ag_x');
  });

  it('outputs valid JSON with --format json (id-shaped rows)', async () => {
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
      '`--limit` must be an integer between 1 and 100.'
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
