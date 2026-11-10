import assert from 'assert';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import createLineIterator from 'line-async-iterator';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import list, {
  getDeploymentDuration,
  stateString,
} from '../../../../src/commands/list';
import { join } from 'path';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import { useTeams, createTeam } from '../../../mocks/team';
import {
  defaultProject,
  useProject,
  useUnknownProject,
} from '../../../mocks/project';
import { useDeployment } from '../../../mocks/deployment';
import {
  parseSpacedTableRow,
  pluckIdentifiersFromDeploymentList,
} from '../../../helpers/parse-table';
import output from '../../../../src/output-manager';
import * as linkModule from '../../../../src/util/projects/link';

const fixture = (name: string) =>
  join(__dirname, '../../../fixtures/unit/commands/list', name);

describe('list', () => {
  describe('--non-interactive', () => {
    it('lists all deployments when not linked and multiple teams (no --scope)', async () => {
      const cwd = setupTmpDir();
      const user = useUser({ version: 'northstar' });
      useTeams('team_dummy');
      createTeam();
      useDeployment({ creator: user });
      client.cwd = cwd;
      client.setArgv('list', '--non-interactive');
      (client as { nonInteractive: boolean }).nonInteractive = true;

      const exitCode = await list(client);
      expect(exitCode).toEqual(0);

      (client as { nonInteractive: boolean }).nonInteractive = false;
    });

    it('outputs project_not_found JSON when the project argument does not resolve', async () => {
      const cwd = setupTmpDir();
      useUser({ version: 'northstar' });
      useTeams('team_dummy');
      useUnknownProject();
      client.cwd = cwd;

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
        code?: number
      ) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.setArgv('list', 'does-not-exist', '--non-interactive');
      (client as { nonInteractive: boolean }).nonInteractive = true;

      try {
        await expect(list(client)).rejects.toThrow('exit:1');

        const payload = JSON.parse(client.stdout.getFullOutput().trim());
        expect(payload).toMatchObject({
          status: 'error',
          reason: 'project_not_found',
          message: 'There is no project for "does-not-exist"',
        });
        expect(
          payload.next?.some((n: { command: string }) =>
            /project ls --query does-not-exist/.test(n.command)
          )
        ).toBe(true);
      } finally {
        exitSpy.mockRestore();
        (client as { nonInteractive: boolean }).nonInteractive = false;
      }
    });
  });

  beforeAll(() => {
    // There seems to be some test pollution elsehwere, causing us to have to reset to what should
    // be the default state here
    output.initialize({
      debug: false,
      noColor: false,
      supportsHyperlink: false,
    });
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'list';

      client.setArgv(command, '--help');
      const exitCodePromise = list(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  describe('[app]', () => {
    it('should get the deployments for a specified project', async () => {
      const user = useUser();
      const { project } = useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });
      const deployment = useDeployment({ creator: user });

      client.setArgv('list', project.name!);
      await list(client);

      const lines = createLineIterator(client.stderr);

      let line = await lines.next();
      expect(line.value).toEqual(`Fetching deployments in ${user.username}`);

      line = await lines.next();
      const { org } = pluckIdentifiersFromDeploymentList(line.value!);
      expect(org).toEqual(user.username);

      line = await lines.next();
      expect(line.value).toEqual('');

      line = await lines.next();
      const header = parseSpacedTableRow(line.value!);
      expect(header).toEqual([
        'Age',
        'Project',
        'Deployment',
        'Status',
        'Environment',
        'Duration',
        'Username',
      ]);

      line = await lines.next();
      const data = parseSpacedTableRow(line.value!);
      data.shift(); // Age
      data.shift(); // Project
      expect(data).toEqual([
        `https://${deployment.url}`,
        stateString(deployment.readyState || ''),
        deployment.target === 'production' ? 'Production' : 'Preview',
        getDeploymentDuration(deployment),
        user.username,
      ]);
    });

    it('should track use of `app` positional argument', async () => {
      const user = useUser();
      const { project } = useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });
      useDeployment({ creator: user });

      client.setArgv('list', project.name!);
      await list(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:app',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--meta', () => {
    it('should track use of `--meta` option', async () => {
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });
      useDeployment({ creator: user });

      client.cwd = fixture('with-team');
      client.setArgv('list', '--meta', 'key=value');
      await list(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:meta',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--policy', () => {
    it('should track use of `--policy` option', async () => {
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });
      useDeployment({ creator: user });

      client.cwd = fixture('with-team');
      client.setArgv('list', '--policy', 'key=value');
      await list(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:policy',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--environment', () => {
    it('should track use of `--environment` option with "production" environment', async () => {
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });
      useDeployment({ creator: user });

      client.cwd = fixture('with-team');
      client.setArgv('list', '--environment', 'production');
      await list(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:environment',
          value: 'production',
        },
      ]);
    });

    it('should track use of `--environment` option with "preview" environment', async () => {
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });
      useDeployment({ creator: user });

      client.cwd = fixture('with-team');
      client.setArgv('list', '--environment', 'preview');
      await list(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:environment',
          value: 'preview',
        },
      ]);
    });

    it('should track use of redacted `--environment` option with custom environment', async () => {
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });
      useDeployment({ creator: user });

      client.cwd = fixture('with-team');
      client.setArgv('list', '--environment', 'custom-environment');
      await list(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:environment',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--next', () => {
    it('should track use of `--next` option', async () => {
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });
      useDeployment({ creator: user });

      client.cwd = fixture('with-team');
      client.setArgv('list', '--next', '123456', '--limit', '5');
      await list(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:next',
          value: '[REDACTED]',
        },
        {
          key: 'option:limit',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--prod', () => {
    it('should track use of `--prod` flag', async () => {
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });
      useDeployment({ creator: user, target: 'production' });

      client.cwd = fixture('with-team');
      client.setArgv('list', '--prod');
      await list(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:prod',
          value: 'TRUE',
        },
      ]);
    });
  });

  describe('--prod deprecation', () => {
    it('should warn that `--prod` is deprecated', async () => {
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });
      useDeployment({ creator: user, target: 'production' });

      client.cwd = fixture('with-team');
      client.setArgv('list', '--prod');
      await list(client);

      expect(client.stderr.getFullOutput()).toContain(
        '--prod is deprecated. Use --environment production.'
      );
    });

    it('should accept -e for --environment without a warning', async () => {
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });
      useDeployment({ creator: user, target: 'production' });

      client.cwd = fixture('with-team');
      client.setArgv('list', '-e', 'production');
      await list(client);

      expect(client.stderr.getFullOutput()).not.toContain('deprecated');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:environment', value: 'production' },
      ]);
    });
  });

  describe('--yes', () => {
    it('should track use of `--yes` flag', async () => {
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });
      useDeployment({ creator: user });

      client.cwd = fixture('with-team');
      client.setArgv('list', '--yes');
      await list(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:yes',
          value: 'TRUE',
        },
      ]);
    });
  });

  describe('--confirm', () => {
    it('should track use of deprecated `--confirm` flag', async () => {
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });
      useDeployment({ creator: user });

      client.cwd = fixture('with-team');
      client.setArgv('list', '--confirm');
      await list(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:confirm',
          value: 'TRUE',
        },
      ]);
    });
  });

  describe('--all', () => {
    it('should track use of `--all` flag', async () => {
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });
      useDeployment({ creator: user });

      client.cwd = fixture('with-team');
      client.setArgv('list', '--all');
      await list(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:all',
          value: 'TRUE',
        },
      ]);
    });

    it('should list all deployments across projects when --all flag is used', async () => {
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });
      useDeployment({ creator: user });

      client.cwd = fixture('with-team');
      client.setArgv('list', '--all');
      const exitCode = await list(client);

      expect(exitCode).toEqual(0);

      const lines = createLineIterator(client.stderr);

      let line = await lines.next();
      expect(line.value).toContain('Fetching deployments');

      // Should show "Deployments" without project-specific label
      line = await lines.next();
      expect(line.value).toContain('Deployments');
      expect(line.value).not.toContain('for');
    });

    it('should error when --all flag is used with app argument', async () => {
      useUser();
      useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });

      client.setArgv('list', 'my-project', '--all');
      const exitCode = await list(client);

      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput(
        'Cannot use --all option with a project argument'
      );
    });
  });

  it('should get deployments from a project linked by a directory', async () => {
    const getLinkedProjectSpy = vi.spyOn(linkModule, 'getLinkedProject');
    const user = useUser();
    const teams = useTeams('team_dummy');
    assert(Array.isArray(teams));
    useProject({
      ...defaultProject,
      id: 'with-team',
      name: 'with-team',
    });
    const deployment = useDeployment({ creator: user });

    client.cwd = fixture('with-team');
    await list(client);
    expect(getLinkedProjectSpy).toHaveBeenCalledWith(client, {
      cwd: client.cwd,
    });
    getLinkedProjectSpy.mockRestore();

    const lines = createLineIterator(client.stderr);

    let line = await lines.next();
    expect(line.value).toEqual('Retrieving project…');

    line = await lines.next();
    expect(line.value).toEqual(`Fetching deployments in ${teams[0].slug}`);

    line = await lines.next();
    const { org } = pluckIdentifiersFromDeploymentList(line.value!);
    expect(org).toEqual(teams[0].slug);

    line = await lines.next();
    expect(line.value).toEqual('');

    line = await lines.next();
    const header = parseSpacedTableRow(line.value!);
    expect(header).toEqual([
      'Age',
      'Project',
      'Deployment',
      'Status',
      'Environment',
      'Duration',
      'Username',
    ]);

    line = await lines.next();
    const data = parseSpacedTableRow(line.value!);
    data.shift(); // Age
    data.shift(); // Project
    expect(data).toEqual([
      `https://${deployment.url}`,
      stateString(deployment.readyState || ''),
      deployment.target === 'production' ? 'Production' : 'Preview',
      getDeploymentDuration(deployment),
      user.username,
    ]);
  });

  it('should output deployment URLs to stdout', async () => {
    const user = useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'with-team',
      name: 'with-team',
    });
    const prodDeployment = useDeployment({
      creator: user,
      createdAt: Date.now() - 1000,
      target: 'production',
    });
    const previewDeployment = useDeployment({
      creator: user,
      createdAt: Date.now(),
      target: undefined,
    });

    client.stdout.isTTY = false;
    client.cwd = fixture('with-team');

    // run with all deployments
    let prom = list(client);
    await expect(client.stdout).toOutput(
      `https://${previewDeployment.url}\nhttps://${prodDeployment.url}`
    );
    await prom;

    // run again with preview deployments only
    client.setArgv('list', '--environment', 'preview');
    prom = list(client);
    await expect(client.stdout).toOutput(`https://${previewDeployment.url}`);
    await prom;

    // run again with production deployments only
    client.setArgv('list', '--environment', 'production');
    prom = list(client);
    await expect(client.stdout).toOutput(`https://${prodDeployment.url}`);
    await prom;
  });

  describe('--status', () => {
    it('should filter deployments by status', async () => {
      const user = useUser();
      const { project } = useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });
      useDeployment({
        creator: user,
        state: 'READY',
        createdAt: Date.now() - 1000,
      });
      useDeployment({
        creator: user,
        state: 'BUILDING',
        createdAt: Date.now(),
      });

      client.setArgv('list', project.name!, '--status', 'READY');
      await list(client);

      const lines = createLineIterator(client.stderr);
      let line = await lines.next();
      expect(line.value).toEqual(`Fetching deployments in ${user.username}`);

      // Skip to the table data
      line = await lines.next(); // project line
      line = await lines.next(); // empty line
      line = await lines.next(); // header
      line = await lines.next(); // data

      const data = parseSpacedTableRow(line.value!);
      // Verify that we have a deployment URL and it shows READY status
      // data[0]=Age, data[1]=Project, data[2]=Deployment, data[3]=Status
      expect(data[2]).toMatch(/^https:\/\/.+/); // URL pattern
      expect(data[3]).toEqual(stateString('READY'));
    });

    it('should error on invalid status', async () => {
      useUser();
      const { project } = useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });

      client.setArgv('list', project.name!, '--status', 'INVALID');
      const exitCode = await list(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'Invalid status values: INVALID. Valid values are: BUILDING, ERROR, INITIALIZING, QUEUED, READY, CANCELED, BLOCKED'
      );
    });

    it('should filter deployments by BLOCKED status', async () => {
      const user = useUser();
      const { project } = useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });
      useDeployment({
        creator: user,
        state: 'READY',
        createdAt: Date.now() - 1000,
      });
      const blockedDeployment = useDeployment({
        creator: user,
        state: 'BLOCKED',
        createdAt: Date.now(),
      });

      client.setArgv(
        'list',
        project.name!,
        '--status',
        'blocked',
        '--format',
        'json'
      );
      const exitCode = await list(client);
      expect(exitCode).toEqual(0);

      const jsonOutput = JSON.parse(client.stdout.getFullOutput());
      expect(jsonOutput.deployments).toHaveLength(1);
      expect(jsonOutput.deployments[0]).toMatchObject({
        id: blockedDeployment.id,
        state: 'BLOCKED',
      });
      expect(client.stderr.getFullOutput()).not.toContain(
        'Invalid status values'
      );
    });

    it('should display BLOCKED deployments with their status', async () => {
      const user = useUser();
      const { project } = useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });
      useDeployment({ creator: user, state: 'BLOCKED' });

      client.setArgv('list', project.name!, '--status', 'BLOCKED');
      const exitCode = await list(client);
      expect(exitCode).toEqual(0);

      const lines = createLineIterator(client.stderr);
      let line = await lines.next();
      expect(line.value).toEqual(`Fetching deployments in ${user.username}`);
      line = await lines.next(); // project line
      line = await lines.next(); // empty line
      line = await lines.next(); // header
      line = await lines.next(); // data

      const data = parseSpacedTableRow(line.value!);
      expect(data[3]).toEqual(stateString('BLOCKED'));
      expect(stateString('BLOCKED')).toContain('Blocked');
      expect(stateString('BLOCKED')).not.toContain('UNKNOWN');
    });

    it('should track status telemetry', async () => {
      const user = useUser();
      const { project } = useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });
      useDeployment({ creator: user });

      client.setArgv('list', project.name!, '--status', 'READY');
      await list(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:status',
          value: '[REDACTED]',
        },
        {
          key: 'argument:app',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--format', () => {
    it('should track telemetry for --format json', async () => {
      const user = useUser();
      const { project } = useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });
      useDeployment({ creator: user });

      client.setArgv('list', project.name!, '--format', 'json');
      await list(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:format',
          value: 'json',
        },
        {
          key: 'argument:app',
          value: '[REDACTED]',
        },
      ]);
    });

    it('should output deployments as JSON', async () => {
      const user = useUser();
      const { project } = useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });
      const deployment = useDeployment({ creator: user });

      client.setArgv('list', project.name!, '--format', 'json');
      const exitCode = await list(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      const jsonOutput = JSON.parse(output);

      expect(jsonOutput).toHaveProperty('deployments');
      expect(Array.isArray(jsonOutput.deployments)).toBe(true);
      expect(jsonOutput.deployments.length).toBeGreaterThan(0);

      const dep = jsonOutput.deployments[0];
      expect(dep).toMatchObject({
        id: deployment.id,
        url: deployment.url,
        name: deployment.name,
        state: deployment.readyState,
        createdAt: deployment.createdAt,
      });
    });

    it('should output empty deployments array as JSON when no deployments', async () => {
      const user = useUser();
      useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });
      // Don't create any deployments
      client.scenario.get('/v6/deployments', (_req, res) => {
        res.json({ deployments: [] });
      });

      client.setArgv('list', 'with-team', '--format', 'json');
      const exitCode = await list(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      const jsonOutput = JSON.parse(output);

      expect(jsonOutput).toEqual({
        deployments: [],
        pagination: undefined,
        contextName: user.username,
      });
    });

    it('should include pagination in JSON output', async () => {
      const user = useUser();
      const { project } = useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });
      useDeployment({ creator: user });

      client.setArgv('list', project.name!, '--format', 'json');
      const exitCode = await list(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      const jsonOutput = JSON.parse(output);

      expect(jsonOutput).toHaveProperty('pagination');
    });
  });
  describe('--next cursor', () => {
    function usePagedDeployments() {
      const queries: Record<string, unknown>[] = [];
      client.scenario.get('/v6/deployments', (req, res) => {
        queries.push(req.query);
        res.json({ deployments: [], pagination: { count: 0, next: null } });
      });
      return queries;
    }

    function setup() {
      client.cwd = setupTmpDir();
      useUser({ version: 'northstar' });
      useTeams('team_dummy');
      (client as { nonInteractive: boolean }).nonInteractive = true;
    }

    it.each([
      [['--next', '1584722256178']],
      [['--next=1584722256178']],
      [['-N', '1584722256178']],
    ])('sends %j to the API as the same timestamp as before', async args => {
      setup();
      const queries = usePagedDeployments();
      client.setArgv('list', ...args);

      expect(await list(client)).toBe(0);
      expect(queries[0].until).toBe('1584722256178');
      (client as { nonInteractive: boolean }).nonInteractive = false;
    });

    it.each([
      [['-t', 'secret-token']],
      [['-dt', 'secret-token']],
      [['--token', 'secret-token']],
    ])('never prints the token from %j in the next page command', async args => {
      setup();
      client.scenario.get('/v6/deployments', (_req, res) => {
        res.json({
          deployments: [
            {
              uid: 'dpl_1',
              name: 'acme-web',
              url: 'acme-web-4f2k9x1-acme.vercel.app',
              created: Date.now(),
              createdAt: Date.now(),
              state: 'READY',
              readyState: 'READY',
              target: 'production',
              creator: { uid: 'user_1', username: 'acme' },
              ready: Date.now(),
              buildingAt: Date.now() - 1000,
            },
          ],
          pagination: { count: 1, next: 1584722256000 },
        });
      });
      client.setArgv('list', '--limit', '1', ...args);

      expect(await list(client)).toBe(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('--next 1584722256000');
      expect(stderr).not.toContain('secret-token');
      expect(stderr).not.toContain('--token');
      (client as { nonInteractive: boolean }).nonInteractive = false;
    });

    it('rejects a value that is not a cursor as a usage error', async () => {
      setup();
      const queries = usePagedDeployments();
      client.setArgv('list', '--next', 'oops');

      expect(await list(client)).toBe(2);
      expect(queries).toHaveLength(0);
      expect(client.stderr.getFullOutput()).toContain(
        '--next must be the cursor printed with the previous page.'
      );
      (client as { nonInteractive: boolean }).nonInteractive = false;
    });
  });

  describe('in a linked folder', () => {
    const linkedDeployment = {
      uid: 'dpl_linked',
      id: 'dpl_linked',
      name: 'with-team',
      url: 'with-team-4f2k9x1-acme.vercel.app',
      createdAt: 1584722256178,
      buildingAt: 1584722256178,
      ready: 1584722266178,
      readyState: 'READY',
      target: 'production',
      creator: { uid: 'user_1', username: 'acme' },
    };

    // Registered before any other `/v6/deployments` mock, so it answers every
    // request. Returns the queries in the order they arrived.
    function useDeploymentsQueries(
      respond: (
        query: Record<string, unknown>,
        res: {
          set(field: string, value: string): unknown;
          status(code: number): unknown;
          json(body: unknown): void;
        }
      ) => void = (_query, res) =>
        res.json({
          deployments: [linkedDeployment],
          pagination: { count: 1, next: null },
        })
    ) {
      const queries: Record<string, unknown>[] = [];
      client.scenario.get('/v6/deployments', (req, res) => {
        queries.push(req.query);
        respond(req.query, res);
      });
      return queries;
    }

    it('sends the deployments request before the project lookup returns', async () => {
      useUser();
      const teams = useTeams('team_dummy');
      assert(Array.isArray(teams));
      let deploymentsRequested = () => {};
      const deploymentsSeen = new Promise<boolean>(resolve => {
        deploymentsRequested = () => resolve(true);
        setTimeout(() => resolve(false), 1000);
      });
      let sentBeforeProjectReturned = false;
      // Runs before the `useProject()` handler and holds the project response
      // until the deployments request arrives (or a second has passed).
      client.scenario.get(
        '/:version/projects/with-team',
        async (_req, _res, next) => {
          sentBeforeProjectReturned = await deploymentsSeen;
          next?.();
        }
      );
      useProject({ ...defaultProject, id: 'with-team', name: 'with-team' });
      const queries = useDeploymentsQueries((_query, res) => {
        deploymentsRequested();
        res.json({
          deployments: [linkedDeployment],
          pagination: { count: 1, next: null },
        });
      });
      client.cwd = fixture('with-team');
      client.setArgv('list');

      expect(await list(client)).toBe(0);
      expect(sentBeforeProjectReturned).toBe(true);
      expect(queries).toEqual([
        { limit: '20', projectId: 'with-team', teamId: 'team_dummy' },
      ]);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(`Deployments for ${teams[0].slug}/with-team`);
      expect(stderr).toContain(`https://${linkedDeployment.url}`);
    });

    it('sends the flag filters with the early request', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({ ...defaultProject, id: 'with-team', name: 'with-team' });
      const queries = useDeploymentsQueries();
      client.cwd = fixture('with-team');
      client.setArgv(
        'list',
        '--limit',
        '5',
        '--next',
        '1584722256178',
        '--environment',
        'production',
        '--status',
        'ready',
        '--meta',
        'foo=bar',
        '--policy',
        'errored=6m'
      );

      expect(await list(client)).toBe(0);
      expect(queries).toEqual([
        {
          limit: '5',
          projectId: 'with-team',
          'meta-foo': 'bar',
          'policy-errored': '6m',
          until: '1584722256178',
          target: 'production',
          state: 'READY',
          teamId: 'team_dummy',
        },
      ]);
    });

    it("scopes the request to the link's team, not the current team", async () => {
      useUser();
      useTeams('team_dummy');
      useProject({ ...defaultProject, id: 'with-team', name: 'with-team' });
      const queries = useDeploymentsQueries();
      client.config.currentTeam = 'team_other';
      client.cwd = fixture('with-team');
      client.setArgv('list');

      expect(await list(client)).toBe(0);
      expect(queries.map(q => q.teamId)).toEqual(['team_dummy']);
    });

    it.each([
      [{ code: 'forbidden', message: 'Not allowed' }, 'PROJECT_UNAUTHORIZED'],
      [
        { code: 'team_unauthorized', message: 'Not allowed' },
        'PROJECT_UNAUTHORIZED',
      ],
      [
        { code: 'forbidden', invalidToken: true, message: 'Bad token' },
        'NOT_AUTHORIZED',
      ],
    ])('throws the same error as before for a 403 project lookup (%j)', async (error, code) => {
      useUser();
      useTeams('team_dummy');
      client.scenario.get('/:version/projects/with-team', (_req, res) => {
        res.status(403).json({ error });
      });
      useDeploymentsQueries();
      client.cwd = fixture('with-team');
      client.setArgv('list');

      await expect(list(client)).rejects.toMatchObject({ code });
      expect(client.stderr.getFullOutput()).not.toContain(
        'Fetching deployments'
      );
    });

    it('sends the usual request at once when the early one is rate limited', async () => {
      useUser();
      const teams = useTeams('team_dummy');
      assert(Array.isArray(teams));
      useProject({ ...defaultProject, id: 'with-team', name: 'with-team' });
      const queries = useDeploymentsQueries((_query, res) => {
        if (queries.length === 1) {
          // The real client waits at least 60 seconds to retry this one.
          res.set('Retry-After', '60');
          res.status(429);
          res.json({
            error: { code: 'rate_limited', message: 'Too many requests' },
          });
          return;
        }
        res.json({
          deployments: [linkedDeployment],
          pagination: { count: 1, next: null },
        });
      });
      client.cwd = fixture('with-team');
      client.setArgv('list');

      expect(await list(client)).toBe(0);
      const query = {
        limit: '20',
        projectId: 'with-team',
        teamId: 'team_dummy',
      };
      expect(queries).toEqual([query, query]);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(`Deployments for ${teams[0].slug}/with-team`);
      expect(stderr).toContain(`https://${linkedDeployment.url}`);
      expect(stderr).not.toContain('Too many requests');
    });

    it('requests the next page when the early page is short', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({ ...defaultProject, id: 'with-team', name: 'with-team' });
      const queries = useDeploymentsQueries((query, res) => {
        const second = query.until === '1584722256000';
        res.json({
          deployments: [
            {
              ...linkedDeployment,
              id: second ? 'dpl_second' : 'dpl_first',
              url: second ? 'second.vercel.app' : 'first.vercel.app',
            },
          ],
          pagination: { count: 1, next: second ? null : 1584722256000 },
        });
      });
      client.cwd = fixture('with-team');
      client.setArgv('list', '--limit', '2', '--format', 'json');

      expect(await list(client)).toBe(0);
      const query = {
        limit: '2',
        projectId: 'with-team',
        teamId: 'team_dummy',
      };
      expect(queries).toEqual([query, { ...query, until: '1584722256000' }]);
      const { deployments } = JSON.parse(client.stdout.getFullOutput());
      expect(deployments.map((d: { id: string }) => d.id)).toEqual([
        'dpl_first',
        'dpl_second',
      ]);
    });

    it('throws the same error as before when the deployments request fails', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({ ...defaultProject, id: 'with-team', name: 'with-team' });
      useDeploymentsQueries((_query, res) => {
        res.status(403);
        res.json({ error: { code: 'forbidden', message: 'Not allowed' } });
      });
      client.cwd = fixture('with-team');
      client.setArgv('list');

      await expect(list(client)).rejects.toMatchObject({
        status: 403,
        code: 'forbidden',
        message: 'Not allowed (403)',
      });
    });

    it('lists every deployment in the scope when the linked project is gone', async () => {
      useUser();
      useTeams('team_dummy');
      useUnknownProject();
      const queries = useDeploymentsQueries((query, res) => {
        if (query.projectId) {
          // The early request for the stale project: never shown.
          res.status(404);
          res.json({
            error: { code: 'not_found', message: 'early request failed' },
          });
          return;
        }
        res.json({
          deployments: [{ ...linkedDeployment, name: 'other-project' }],
          pagination: { count: 1, next: null },
        });
      });
      client.cwd = fixture('with-team');
      client.setArgv('list');

      expect(await list(client)).toBe(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        'Your Project was either deleted, transferred to a new Team, or you don’t have access to it anymore.'
      );
      expect(stderr).toContain('Deployments under');
      expect(stderr).toContain('other-project');
      expect(stderr).not.toContain('early request failed');
      expect(queries.filter(q => q.projectId === undefined)).toHaveLength(1);
    });

    it('exits 1 when VERCEL_ORG_ID and VERCEL_PROJECT_ID name a missing project', async () => {
      useUser();
      useTeams('team_dummy');
      useUnknownProject();
      const queries = useDeploymentsQueries();
      client.cwd = setupTmpDir();
      client.setArgv('list');

      process.env.VERCEL_ORG_ID = 'team_dummy';
      process.env.VERCEL_PROJECT_ID = 'prj_missing';
      try {
        expect(await list(client)).toBe(1);
      } finally {
        delete process.env.VERCEL_ORG_ID;
        delete process.env.VERCEL_PROJECT_ID;
      }
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        'Project not found ({"VERCEL_PROJECT_ID":"prj_missing","VERCEL_ORG_ID":"team_dummy"})'
      );
      expect(stderr).not.toContain('Fetching deployments');
      expect(stderr).not.toContain(linkedDeployment.url);
      // At most the early request, which is discarded.
      expect(queries.every(q => q.projectId === 'prj_missing')).toBe(true);
    });

    it.each([
      [['--next', 'oops'], 2, '--next must be the cursor printed'],
      [['--limit', '0'], 1, 'Please provide an integer from 1 to 100'],
    ])('exits as before for %j without requesting deployments', async (args, exitCode, message) => {
      useUser();
      useTeams('team_dummy');
      useProject({ ...defaultProject, id: 'with-team', name: 'with-team' });
      const queries = useDeploymentsQueries();
      client.cwd = fixture('with-team');
      client.setArgv('list', ...args);

      expect(await list(client)).toBe(exitCode);
      expect(queries).toHaveLength(0);
      expect(client.stderr.getFullOutput()).toContain(message);
    });

    it('prints the same --json shape', async () => {
      useUser();
      const teams = useTeams('team_dummy');
      assert(Array.isArray(teams));
      useProject({ ...defaultProject, id: 'with-team', name: 'with-team' });
      useDeploymentsQueries();
      client.cwd = fixture('with-team');
      client.setArgv('list', '--format', 'json');

      expect(await list(client)).toBe(0);
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
        contextName: teams[0].slug,
        deployments: [
          {
            id: linkedDeployment.id,
            url: linkedDeployment.url,
            name: linkedDeployment.name,
            state: linkedDeployment.readyState,
            target: linkedDeployment.target,
            createdAt: linkedDeployment.createdAt,
            buildingAt: linkedDeployment.buildingAt,
            ready: linkedDeployment.ready,
            creator: linkedDeployment.creator,
          },
        ],
        pagination: { count: 1, next: null },
      });
    });

    it('lists the named project, not the linked one, for `list <app>`', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({ ...defaultProject, id: 'other-app', name: 'other-app' });
      const queries = useDeploymentsQueries();
      client.cwd = fixture('with-team');
      client.setArgv('list', 'other-app');

      expect(await list(client)).toBe(0);
      expect(queries.map(q => q.projectId)).toEqual(['other-app']);
    });
  });
});
