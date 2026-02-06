import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import link from '../../../../src/commands/link';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('link ls', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'link';
      const subcommand = 'ls';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = link(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  describe('single project link', () => {
    beforeEach(() => {
      const cwd = setupUnitFixture('commands/link/single-project');
      client.cwd = cwd;
    });

    it('should list the linked project', async () => {
      client.setArgv('link', 'ls');
      const exitCode = await link(client);
      expect(exitCode).toEqual(0);

      const stderr = client.stderr.getFullOutput();
      const stdout = client.stdout.getFullOutput();
      expect(stderr).toContain('Found 1 linked project');
      expect(stdout).toContain('prj_single_project');
      expect(stdout).toContain('team_single');
    });

    it('tracks telemetry', async () => {
      client.setArgv('link', 'ls');
      const exitCode = await link(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:list',
          value: 'ls',
        },
      ]);
    });
  });

  describe('monorepo link (repo.json)', () => {
    beforeEach(() => {
      const cwd = setupUnitFixture('commands/link/monorepo-ls');
      client.cwd = cwd;
    });

    it('should list all projects from repo.json', async () => {
      client.setArgv('link', 'ls');
      const exitCode = await link(client);
      expect(exitCode).toEqual(0);

      const stderr = client.stderr.getFullOutput();
      const stdout = client.stdout.getFullOutput();
      expect(stderr).toContain('Found 3 linked projects');
      expect(stdout).toContain('prj_dashboard');
      expect(stdout).toContain('prj_marketing');
      expect(stdout).toContain('prj_lib');
      expect(stdout).toContain('apps/dashboard');
      expect(stdout).toContain('apps/marketing');
      expect(stdout).toContain('packages/lib');
    });
  });

  describe('nested project links', () => {
    beforeEach(() => {
      const cwd = setupUnitFixture('commands/link/nested-links');
      client.cwd = cwd;
    });

    it('should list root and nested projects', async () => {
      client.setArgv('link', 'ls');
      const exitCode = await link(client);
      expect(exitCode).toEqual(0);

      const stderr = client.stderr.getFullOutput();
      const stdout = client.stdout.getFullOutput();
      expect(stderr).toContain('Found 3 linked projects');
      expect(stdout).toContain('prj_root');
      expect(stdout).toContain('prj_app_a');
      expect(stdout).toContain('prj_app_b');
    });
  });

  describe('no links found', () => {
    beforeEach(() => {
      const cwd = setupUnitFixture('commands/link/no-links');
      client.cwd = cwd;
    });

    it('should show message when no links exist', async () => {
      client.setArgv('link', 'ls');
      const exitCode = await link(client);
      expect(exitCode).toEqual(0);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('No linked projects found');
    });
  });

  describe('--format json', () => {
    beforeEach(() => {
      const cwd = setupUnitFixture('commands/link/single-project');
      client.cwd = cwd;
    });

    it('tracks telemetry for --format json', async () => {
      client.setArgv('link', 'ls', '--format', 'json');
      const exitCode = await link(client);
      expect(exitCode).toEqual(0);

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

    it('outputs valid JSON', async () => {
      client.setArgv('link', 'ls', '--format', 'json');
      const exitCode = await link(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      const jsonOutput = JSON.parse(output);

      expect(jsonOutput).toHaveProperty('projects');
      expect(Array.isArray(jsonOutput.projects)).toBe(true);
    });

    it('outputs correct project structure', async () => {
      client.setArgv('link', 'ls', '--format', 'json');
      const exitCode = await link(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      const jsonOutput = JSON.parse(output);

      expect(jsonOutput.projects.length).toBeGreaterThan(0);
      const firstProject = jsonOutput.projects[0];
      expect(firstProject).toHaveProperty('path');
      expect(firstProject).toHaveProperty('orgId');
      expect(firstProject).toHaveProperty('projectId');
      expect(firstProject.path).toEqual('.');
      expect(firstProject.orgId).toEqual('team_single');
      expect(firstProject.projectId).toEqual('prj_single_project');
    });

    it('outputs empty array when no links exist', async () => {
      const cwd = setupUnitFixture('commands/link/no-links');
      client.cwd = cwd;

      client.setArgv('link', 'ls', '--format', 'json');
      const exitCode = await link(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      const jsonOutput = JSON.parse(output);

      expect(jsonOutput).toHaveProperty('projects');
      expect(jsonOutput.projects).toEqual([]);
    });
  });

  describe('monorepo JSON output', () => {
    beforeEach(() => {
      const cwd = setupUnitFixture('commands/link/monorepo-ls');
      client.cwd = cwd;
    });

    it('outputs all projects with correct paths', async () => {
      client.setArgv('link', 'ls', '--format', 'json');
      const exitCode = await link(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      const jsonOutput = JSON.parse(output);

      expect(jsonOutput.projects.length).toEqual(3);

      const paths = jsonOutput.projects.map((p: { path: string }) => p.path);
      expect(paths).toContain('apps/dashboard');
      expect(paths).toContain('apps/marketing');
      expect(paths).toContain('packages/lib');
    });
  });
});
