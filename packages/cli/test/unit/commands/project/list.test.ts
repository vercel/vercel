import { describe, it, expect } from 'vitest';
import createLineIterator from 'line-async-iterator';
import projects from '../../../../src/commands/project';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import {
  defaultProject,
  useProject,
  useProjectList,
} from '../../../mocks/project';
import { client } from '../../../mocks/client';

import { parseSpacedTableRow } from '../../../helpers/parse-table';
import assert from 'node:assert';

describe('list', () => {
  describe('invalid argument', () => {
    it('errors', async () => {
      useUser();
      client.setArgv('project', 'list', 'balderdash');
      const exitCode = await projects(client);

      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput('Invalid number of arguments');
    });
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'project';
      const subcommand = 'list';

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

  describe('--update-required', () => {
    it('should track flag', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
      });

      client.setArgv('project', 'ls', '--update-required');
      await projects(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: `subcommand:list`,
          value: 'ls',
        },
        {
          key: `flag:update-required`,
          value: 'TRUE',
        },
      ]);
    });
  });

  describe('--next', () => {
    it('should track flag', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
      });

      client.setArgv('project', 'ls', '--next', '1', '--limit', '5');
      await projects(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: `subcommand:list`,
          value: 'ls',
        },
        {
          key: `option:next`,
          value: '[REDACTED]',
        },
        {
          key: `option:limit`,
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--filter', () => {
    it('should track flag', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
      });

      client.setArgv('project', 'ls', '--filter', 'my-app');
      await projects(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: `subcommand:list`,
          value: 'ls',
        },
        {
          key: `option:filter`,
          value: '[REDACTED]',
        },
      ]);
    });

    it('should pass filter to the API as the search query param', async () => {
      useUser();
      useTeams('team_dummy');

      let receivedSearch: string | undefined;
      client.scenario.get(`/v9/projects`, (req, res) => {
        receivedSearch = req.query.search as string | undefined;
        res.json({
          projects: [defaultProject],
          pagination: {},
        });
      });

      useProject({
        ...defaultProject,
      });

      client.setArgv('project', 'ls', '--filter', 'my-app');
      const exitCode = await projects(client);

      expect(exitCode).toEqual(0);
      expect(receivedSearch).toEqual('my-app');
    });
  });

  it('should not ask the API for the latest deployments', async () => {
    useUser();
    useTeams('team_dummy');

    let receivedQuery: Record<string, unknown> | undefined;
    client.scenario.get(`/v9/projects`, (req, res) => {
      receivedQuery = req.query;
      res.json({
        projects: [defaultProject],
        pagination: {},
      });
    });

    client.setArgv('project', 'ls');
    const exitCode = await projects(client);

    expect(exitCode).toEqual(0);
    expect(receivedQuery?.latestDeployments).toEqual('0');
    expect(receivedQuery?.limit).toEqual('20');
  });

  describe('--paused', () => {
    function pausedNames() {
      const result = JSON.parse(client.stdout.getFullOutput());
      return {
        names: result.projects.map((p: { name: string }) => p.name),
        pagination: result.pagination,
      };
    }

    it('should track flag', async () => {
      useUser();
      useTeams('team_dummy');
      useProjectList([]);

      client.setArgv('project', 'ls', '--paused');
      await projects(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:list', value: 'ls' },
        { key: 'flag:paused', value: 'TRUE' },
      ]);
    });

    it('lists only paused projects from every page', async () => {
      useUser();
      useTeams('team_dummy');
      const requests = useProjectList(
        Array.from({ length: 150 }, (_, i) => ({
          id: `prj_${i}`,
          name: `site-${i}`,
          updatedAt: 1000 - i,
          paused: i === 0 || i === 120 || i === 149,
        }))
      );

      client.setArgv('project', 'ls', '--paused', '--json');
      const exitCode = await projects(client);

      expect(exitCode).toEqual(0);
      const result = JSON.parse(client.stdout.getFullOutput());
      expect(
        result.projects.map((p: { name: string; paused: boolean }) => [
          p.name,
          p.paused,
        ])
      ).toEqual([
        ['site-0', true],
        ['site-120', true],
        ['site-149', true],
      ]);
      expect(result.pagination).toEqual({ count: 3, next: null });
      expect(requests).toEqual([
        { limit: '100' },
        { limit: '100', until: '902' },
      ]);
    });

    it('stops at --limit and points --next at the last paused project', async () => {
      useUser();
      useTeams('team_dummy');
      useProjectList([
        { id: 'prj_a', name: 'site-a', paused: true, updatedAt: 300 },
        { id: 'prj_b', name: 'site-b', paused: true, updatedAt: 200 },
        { id: 'prj_c', name: 'site-c', paused: true, updatedAt: 100 },
      ]);

      client.setArgv('project', 'ls', '--paused', '--limit', '2', '--json');
      const exitCode = await projects(client);

      expect(exitCode).toEqual(0);
      expect(pausedNames()).toEqual({
        names: ['site-a', 'site-b'],
        pagination: { count: 2, next: 200 },
      });
    });

    describe('projects updated at the same moment', () => {
      const tied = [
        { id: 'prj_a', name: 'site-a', paused: true, updatedAt: 300 },
        { id: 'prj_b', name: 'site-b', paused: true, updatedAt: 200 },
        { id: 'prj_c', name: 'site-c', paused: true, updatedAt: 200 },
      ];

      it('ends the page before them', async () => {
        useUser();
        useTeams('team_dummy');
        useProjectList(tied);

        client.setArgv('project', 'ls', '--paused', '--limit', '2', '--json');
        const exitCode = await projects(client);

        expect(exitCode).toEqual(0);
        expect(pausedNames()).toEqual({
          names: ['site-a'],
          pagination: { count: 1, next: 201 },
        });
      });

      it('lists all of them on the next page', async () => {
        useUser();
        useTeams('team_dummy');
        useProjectList(tied);

        client.setArgv(
          'project',
          'ls',
          '--paused',
          '--limit',
          '2',
          '--next',
          '201',
          '--json'
        );
        const exitCode = await projects(client);

        expect(exitCode).toEqual(0);
        expect(pausedNames()).toEqual({
          names: ['site-b', 'site-c'],
          pagination: { count: 2, next: null },
        });
      });

      it('runs past --limit when they fill the whole page', async () => {
        useUser();
        useTeams('team_dummy');
        useProjectList([
          { id: 'prj_a', name: 'site-a', paused: true, updatedAt: 200 },
          { id: 'prj_b', name: 'site-b', paused: true, updatedAt: 200 },
          { id: 'prj_c', name: 'site-c', paused: true, updatedAt: 200 },
          { id: 'prj_d', name: 'site-d', paused: true, updatedAt: 100 },
        ]);

        client.setArgv('project', 'ls', '--paused', '--limit', '2', '--json');
        const exitCode = await projects(client);

        expect(exitCode).toEqual(0);
        expect(pausedNames()).toEqual({
          names: ['site-a', 'site-b', 'site-c'],
          pagination: { count: 3, next: 200 },
        });
      });

      it('finds them across the API pages', async () => {
        useUser();
        useTeams('team_dummy');
        // The API's first page ends inside the pair updated at 500.
        useProjectList([
          ...Array.from({ length: 99 }, (_, i) => ({
            id: `prj_${i}`,
            name: `site-${i}`,
            updatedAt: 1000 - i,
          })),
          { id: 'prj_x', name: 'site-x', paused: true, updatedAt: 500 },
          { id: 'prj_y', name: 'site-y', paused: true, updatedAt: 500 },
        ]);

        client.setArgv('project', 'ls', '--paused', '--json');
        const exitCode = await projects(client);

        expect(exitCode).toEqual(0);
        expect(pausedNames()).toEqual({
          names: ['site-x', 'site-y'],
          pagination: { count: 2, next: null },
        });
      });
    });

    it('marks paused projects in the table', async () => {
      useUser();
      useTeams('team_dummy');
      useProjectList([{ id: 'prj_a', name: 'site-a', paused: true }]);

      client.setArgv('project', 'ls', '--paused');
      const exitCode = await projects(client);

      expect(exitCode).toEqual(0);
      const lines = createLineIterator(client.stderr);
      await lines.next();
      const heading = await lines.next();
      expect(heading.value).toContain('that are paused');
      await lines.next();
      await lines.next();
      const row = parseSpacedTableRow((await lines.next()).value!);
      expect(row[0]).toEqual('site-a');
      expect(row[row.length - 1]).toEqual('Paused');
    });

    it('says when no projects are paused', async () => {
      useUser();
      useTeams('team_dummy');
      useProjectList([{ id: 'prj_a', name: 'site-a', paused: false }]);

      client.setArgv('project', 'ls', '--paused');
      const exitCode = await projects(client);

      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('No projects found under');
    });
  });

  describe('--json', () => {
    it('should track flag', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
      });

      client.setArgv('project', 'ls', '--json');
      await projects(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: `subcommand:list`,
          value: 'ls',
        },
        {
          key: `flag:json`,
          value: 'TRUE',
        },
      ]);
    });

    it('should output projects in JSON format', async () => {
      const user = useUser();
      useTeams('team_dummy');
      const project = useProject({
        ...defaultProject,
      });

      client.setArgv('project', 'ls', '--json');
      await projects(client);

      const output = client.stdout.getFullOutput();

      const parsedOutput = JSON.parse(output);
      expect(parsedOutput).toMatchObject({
        projects: expect.arrayContaining([
          expect.objectContaining({
            name: project.project.name,
            id: project.project.id,
            latestProductionUrl: expect.any(String),
            updatedAt: expect.any(Number),
            nodeVersion: null,
            deprecated: false,
            paused: false,
          }),
        ]),
        pagination: expect.any(Object),
        contextName: user.username,
        elapsed: expect.any(String),
      });
    });
  });

  describe('--format', () => {
    it('should track telemetry for --format json', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
      });

      client.setArgv('project', 'ls', '--format', 'json');
      await projects(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:list',
          value: 'ls',
        },
        {
          key: 'option:format',
          value: 'json',
        },
      ]);
    });

    it('outputs projects as valid JSON that can be piped to jq', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
      });

      client.setArgv('project', 'ls', '--format', 'json');
      const exitCode = await projects(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      // Should be valid JSON - this will throw if not parseable
      const jsonOutput = JSON.parse(output);

      expect(jsonOutput).toHaveProperty('projects');
      expect(jsonOutput).toHaveProperty('pagination');
      expect(Array.isArray(jsonOutput.projects)).toBe(true);
    });
  });

  it('should list projects', async () => {
    const user = useUser();
    useTeams('team_dummy');
    const project = useProject({
      ...defaultProject,
    });

    client.setArgv('project', 'ls');
    await projects(client);

    const lines = createLineIterator(client.stderr);

    let line = await lines.next();
    expect(line.value).toEqual(`Fetching projects in ${user.username}`);

    line = await lines.next();
    expect(line.value).toContain(user.username);

    // empty line
    line = await lines.next();
    expect(line.value).toEqual('');

    line = await lines.next();
    const header = parseSpacedTableRow(line.value!);
    expect(header).toEqual([
      'Project Name',
      'Latest Production URL',
      'Updated',
      'Node Version',
      'Status',
    ]);

    line = await lines.next();
    const data = parseSpacedTableRow(line.value!);
    data.pop();
    expect(data).toEqual([project.project.name, 'https://foobar.com']);
  });

  it('should list projects when there is no production deployment', async () => {
    const user = useUser();
    useTeams('team_dummy');
    assert(defaultProject.targets?.production);
    const project = useProject({
      ...defaultProject,
      targets: {
        production: {
          ...defaultProject.targets.production,
          alias: [],
        },
      },
    });

    client.setArgv('project', 'ls');
    await projects(client);

    const lines = createLineIterator(client.stderr);

    let line = await lines.next();
    expect(line.value).toEqual(`Fetching projects in ${user.username}`);

    line = await lines.next();
    expect(line.value).toContain(user.username);

    // empty line
    line = await lines.next();
    expect(line.value).toEqual('');

    line = await lines.next();
    const header = parseSpacedTableRow(line.value!);
    expect(header).toEqual([
      'Project Name',
      'Latest Production URL',
      'Updated',
      'Node Version',
      'Status',
    ]);

    line = await lines.next();
    const data = parseSpacedTableRow(line.value!);
    data.pop();
    expect(data).toEqual([project.project.name, '--']);
  });
  describe('--next cursor', () => {
    function usePagedApi() {
      const queries: Record<string, unknown>[] = [];
      client.scenario.get('/v9/projects', (req, res) => {
        queries.push(req.query);
        res.json({
          projects: [defaultProject],
          pagination: { count: 1, next: 1584722256000 },
        });
      });
      return queries;
    }

    it.each([
      [['--next', '1584722256178']],
      [['--next=1584722256178']],
      [['-N', '1584722256178']],
    ])('sends %j to the API as the same timestamp as before', async args => {
      useUser();
      useTeams('team_dummy');
      const queries = usePagedApi();
      client.setArgv('project', 'ls', ...args);

      expect(await projects(client)).toBe(0);
      expect(queries[0].until).toBe('1584722256178');
      expect(client.stderr.getFullOutput()).toContain(
        '  Next page:\n    vercel project ls --next 1584722256000\n'
      );
    });

    it('warns when the hidden -N is used, and not with --json', async () => {
      useUser();
      useTeams('team_dummy');
      usePagedApi();
      client.setArgv('project', 'ls', '-N', '1584722256178');
      expect(await projects(client)).toBe(0);
      expect(client.stderr.getFullOutput()).toContain(
        '! -N is deprecated. Use --next.'
      );

      client.reset();
      useUser();
      useTeams('team_dummy');
      usePagedApi();
      client.setArgv('project', 'ls', '-N', '1584722256178', '--json');
      expect(await projects(client)).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain('deprecated');
      expect(JSON.parse(client.stdout.getFullOutput()).pagination.next).toBe(
        1584722256000
      );
    });

    it('rejects a value that is not a cursor as a usage error', async () => {
      useUser();
      useTeams('team_dummy');
      const queries = usePagedApi();
      client.setArgv('project', 'ls', '--next', 'oops');

      expect(await projects(client)).toBe(2);
      expect(queries).toHaveLength(0);
      expect(client.stderr.getFullOutput()).toContain(
        '--next must be the cursor printed with the previous page.'
      );
    });
  });

  describe('--query', () => {
    // Runs `project ls` with a fresh client, recording the projects request.
    async function run(...args: string[]) {
      client.reset();
      useUser({ id: 'user_1', username: 'tester' });
      useTeams('team_dummy');
      let query: Record<string, unknown> | undefined;
      client.scenario.get('/v9/projects', (req, res) => {
        query = req.query;
        res.json({
          projects: [defaultProject],
          pagination: { count: 1, next: 1584722256178, prev: null },
        });
      });
      client.setArgv('project', 'ls', ...args);
      const exitCode = await projects(client);
      return {
        exitCode,
        query,
        stdout: client.stdout.getFullOutput(),
        stderr: client.stderr.getFullOutput(),
      };
    }

    // JSON output, without the run's timing.
    function json(stdout: string) {
      const { elapsed: _elapsed, ...rest } = JSON.parse(stdout);
      return rest;
    }

    it('searches project names with --query', async () => {
      const result = await run('--query', 'my-app');

      expect(result.exitCode).toBe(0);
      expect(result.query).toMatchObject({ search: 'my-app' });
      expect(result.stderr).not.toContain('deprecated');
      expect(result.stderr).toContain('project ls --query my-app --next');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:list', value: 'ls' },
        { key: 'option:query', value: '[REDACTED]' },
      ]);
    });

    it.each([
      ['--filter', ['--filter', 'my-app']],
      ['-f', ['-f', 'my-app']],
    ])('still accepts %s, with one warning that names --query', async (typed, oldArgs) => {
      const now = await run('--query', 'my-app');
      const before = await run(...oldArgs);

      expect(before.exitCode).toBe(now.exitCode);
      expect(before.query).toEqual(now.query);
      expect(before.stdout).toBe(now.stdout);
      expect(before.stderr.match(/deprecated/g)).toHaveLength(1);
      expect(before.stderr).toContain(
        `! ${typed} is deprecated. Use --query.\n`
      );
      expect(before.stderr).toContain('project ls --query my-app --next');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:list', value: 'ls' },
        { key: 'option:filter', value: '[REDACTED]' },
      ]);
    });

    it('keeps -f mixed with --filter working, with the last value', async () => {
      const result = await run('-f', 'one', '--filter', 'two');

      expect(result.exitCode).toBe(0);
      expect(result.query).toMatchObject({ search: 'two' });
      expect(result.stderr.match(/deprecated/g)).toHaveLength(1);
    });

    it('puts the warning in the JSON warnings list instead of on stderr', async () => {
      const now = await run('--query', 'my-app', '--json');
      const before = await run('--filter', 'my-app', '--json');

      expect(before.exitCode).toBe(0);
      expect(before.query).toEqual(now.query);
      expect(json(now.stdout)).not.toHaveProperty('warnings');
      expect(json(before.stdout)).toEqual({
        ...json(now.stdout),
        warnings: [
          {
            reason: 'deprecated',
            message: '--filter is deprecated. Use --query.',
          },
        ],
      });
      expect(before.stderr).not.toContain('deprecated');
    });

    it.each([
      [['--query', 'a', '--filter', 'b'], "Can't use --query with --filter."],
      [['--query', 'a', '-f', 'b'], "Can't use --query with -f."],
    ])('rejects %j before any request', async (args, message) => {
      const result = await run(...args);

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain(message);
      expect(result.query).toBeUndefined();
    });
  });
});
