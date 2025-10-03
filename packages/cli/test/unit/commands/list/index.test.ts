import assert from 'assert';
import { describe, it, expect, beforeAll } from 'vitest';
import createLineIterator from 'line-async-iterator';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import list, {
  getDeploymentDuration,
  stateString,
} from '../../../../src/commands/list';
import { join } from 'path';
import { useTeams } from '../../../mocks/team';
import { defaultProject, useProject } from '../../../mocks/project';
import { useDeployment } from '../../../mocks/deployment';
import {
  parseSpacedTableRow,
  pluckIdentifiersFromDeploymentList,
} from '../../../helpers/parse-table';
import output from '../../../../src/output-manager';

const fixture = (name: string) =>
  join(__dirname, '../../../fixtures/unit/commands/list', name);

describe('list', () => {
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
        'Deployment',
        'Status',
        'Environment',
        'Duration',
        'Username',
      ]);

      line = await lines.next();
      const data = parseSpacedTableRow(line.value!);
      data.shift();
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
      client.setArgv('list', '--next', '123456');
      await list(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:next',
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

  it('should get deployments from a project linked by a directory', async () => {
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
      'Deployment',
      'Status',
      'Environment',
      'Duration',
      'Username',
    ]);

    line = await lines.next();
    const data = parseSpacedTableRow(line.value!);
    data.shift();
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
      expect(data[1]).toMatch(/^https:\/\/.+/); // URL pattern
      expect(data[2]).toEqual(stateString('READY'));
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
        'Invalid status values: INVALID. Valid values are: BUILDING, ERROR, INITIALIZING, QUEUED, READY, CANCELED'
      );
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
});
