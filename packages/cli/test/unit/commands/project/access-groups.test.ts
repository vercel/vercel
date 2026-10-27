import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { client } from '../../../mocks/client';
import project from '../../../../src/commands/project';
import { defaultProject, useProject } from '../../../mocks/project';
import { expectDeprecationInJson } from '../../../helpers/deprecation-warning';

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
    expect(exitCode).toBe(2);
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
  describe('--next cursor', () => {
    function usePagedAccessGroups(next: string | null) {
      useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
      const queries: Record<string, unknown>[] = [];
      client.scenario.get('/v1/access-groups', (req, res) => {
        queries.push(req.query);
        res.json({
          accessGroups: [{ id: 'ag_2', name: 'Backend', role: null }],
          pagination: { count: 1, next },
        });
      });
      return queries;
    }

    it('sends the cursor from the previous page to the API as is', async () => {
      // `--next` used to be read as a number, so this cursor became `NaN`.
      const queries = usePagedAccessGroups(null);
      client.setArgv(
        'project',
        'access-groups',
        'my-project',
        '--next',
        'eyJpZCI6ImFnXzEifQ'
      );

      expect(await project(client)).toBe(0);
      expect(queries[0].next).toBe('eyJpZCI6ImFnXzEifQ');
    });

    it('keeps sending a numeric value as before', async () => {
      const queries = usePagedAccessGroups(null);
      client.setArgv('project', 'access-groups', 'my-project', '-N', '123');

      expect(await project(client)).toBe(0);
      expect(queries[0].next).toBe('123');
    });

    it('prints the next page command when there is another page', async () => {
      usePagedAccessGroups('eyJpZCI6ImFnXzIifQ');
      client.setArgv(
        'project',
        'access-groups',
        'my-project',
        '--search',
        'Back end',
        '--limit',
        '1'
      );

      expect(await project(client)).toBe(0);
      expect(client.stderr.getFullOutput()).toContain(
        "  Next page:\n    vercel project access-groups my-project --query 'Back end' --limit 1 --next=eyJpZCI6ImFnXzIifQ\n"
      );
    });

    it('keeps --scope and --cwd, which the router reads first, in the next page command', async () => {
      usePagedAccessGroups('eyJpZCI6ImFnXzIifQ');
      client.setArgv(
        '--scope',
        'acme',
        'project',
        'access-groups',
        'my-project',
        '--cwd',
        '/tmp/acme web'
      );

      expect(await project(client)).toBe(0);
      expect(client.stderr.getFullOutput()).toContain(
        "    vercel --scope acme project access-groups my-project --cwd '/tmp/acme web' --next=eyJpZCI6ImFnXzIifQ\n"
      );
    });

    it('never prints the token in the next page command', async () => {
      usePagedAccessGroups('eyJpZCI6ImFnXzIifQ');
      client.setArgv(
        'project',
        'access-groups',
        'my-project',
        '-dt',
        'secret-token'
      );

      expect(await project(client)).toBe(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        '    vercel project access-groups my-project -d --next=eyJpZCI6ImFnXzIifQ\n'
      );
      expect(stderr).not.toContain('secret-token');
    });

    it('prints no next page command on the last page', async () => {
      usePagedAccessGroups(null);
      client.setArgv('project', 'access-groups', 'my-project');

      expect(await project(client)).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain('Next page:');
    });

    it('keeps the JSON output as the API response', async () => {
      usePagedAccessGroups('eyJpZCI6ImFnXzIifQ');
      client.setArgv('project', 'access-groups', 'my-project', '--json');

      expect(await project(client)).toBe(0);
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
        accessGroups: [{ id: 'ag_2', name: 'Backend', role: null }],
        pagination: { count: 1, next: 'eyJpZCI6ImFnXzIifQ' },
      });
      expect(client.stderr.getFullOutput()).not.toContain('Next page:');
    });
  });

  describe('--query', () => {
    async function run(...args: string[]) {
      client.reset();
      useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
      let query: Record<string, unknown> | undefined;
      client.scenario.get('/v1/access-groups', (req, res) => {
        query = req.query;
        res.json({ accessGroups: [], pagination: { count: 0, next: null } });
      });
      client.setArgv('project', 'access-groups', 'my-project', ...args);
      const exitCode = await project(client);
      return {
        exitCode,
        query,
        stdout: client.stdout.getFullOutput(),
        stderr: client.stderr.getFullOutput(),
      };
    }

    it('still accepts --search, with one warning that names --query', async () => {
      const now = await run('--query', 'Back end');
      const before = await run('--search', 'Back end');

      expect(now.exitCode).toBe(0);
      expect(now.query).toMatchObject({ search: 'Back end' });
      expect(now.stderr).not.toContain('deprecated');
      expect(before.exitCode).toBe(now.exitCode);
      expect(before.query).toEqual(now.query);
      expect(before.stdout).toBe(now.stdout);
      expect(before.stderr.match(/deprecated/g)).toHaveLength(1);
      expect(before.stderr).toContain(
        '! --search is deprecated. Use --query.\n'
      );

      const nowJson = await run('--query', 'Back end', '--json');
      const beforeJson = await run('--search', 'Back end', '--json');
      expectDeprecationInJson(
        beforeJson.stdout,
        nowJson.stdout,
        '--search is deprecated. Use --query.'
      );
      expect(beforeJson.stderr).not.toContain('deprecated');
    });

    it('rejects --query with --search before any request', async () => {
      const result = await run('--query', 'a', '--search', 'b');

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("Can't use --query with --search.");
      expect(result.query).toBeUndefined();
    });
  });
});
