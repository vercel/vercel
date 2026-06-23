import { EOL } from 'node:os';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { basename, join } from 'path';
import { readFile } from 'fs-extra';
import stripAnsi from 'strip-ansi';
import { readJSON, mkdirp, writeFile, writeJSON, pathExists } from 'fs-extra';
import link from '../../../../src/commands/link';
import pull from '../../../../src/commands/env/pull';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeams, createTeam, type Team } from '../../../mocks/team';
import {
  defaultProject,
  useProject,
  useUnknownProject,
} from '../../../mocks/project';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import getProjectByNameOrId from '../../../../src/util/projects/get-project-by-id-or-name';
import { ProjectNotFound } from '../../../../src/util/errors-ts';

// Mock the env pull command
vi.mock('../../../../src/commands/env/pull');
const mockPull = vi.mocked(pull);

function expectLinkRowsUseExpectedGlyphs(output: string, labels: string[]) {
  const plain = stripAnsi(output);
  const completedLabels = new Set(['Created', 'Linked', 'Added']);

  // Exact blank-gutter spacing is covered by printAlignedLabel() unit tests.
  // Command transcripts assert row presence plus the semantic glyph contract.
  for (const label of labels) {
    const prefix = completedLabels.has(label) ? '✓ ' : '\\s{0,2}';
    expect(plain).toMatch(new RegExp(`^${prefix}${label.padEnd(16)}`, 'm'));
  }

  expect(plain).not.toMatch(
    /^▲ (Project|Source|Created|Linked|Added|Directory|Searched|Projects|Config)\s/m
  );
  expect(plain).not.toMatch(
    /^✓ (Project|Source|Directory|Searched|Projects|Config)\s/m
  );
}

describe('link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.isAgent = false;
    // Default mock implementation for env pull command
    mockPull.mockResolvedValue(0);
  });
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'link';

      client.setArgv(command, '--help');
      const exitCodePromise = link(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  describe('--repo', () => {
    it('should support linking using `--repo` flag', async () => {
      const user = useUser();
      const cwd = setupTmpDir();

      // Set up a `.git/config` file to simulate a repo
      await mkdirp(join(cwd, '.git'));
      const repoUrl = 'https://github.com/test/test.git';
      await writeFile(
        join(cwd, '.git/config'),
        `[remote "upstream"]\n\turl = ${repoUrl}\n\tfetch = +refs/heads/*:refs/remotes/upstream/*\n`
      );

      useTeams('team_dummy');
      const { project } = useProject({
        ...defaultProject,
        id: basename(cwd),
        name: basename(cwd),
      });
      useUnknownProject();

      client.cwd = cwd;
      client.setArgv('--repo');
      const exitCodePromise = link(client);

      await expect(client.stderr).toOutput(
        'The `--repo` flag is in alpha, please report issues'
      );

      await expect(client.stderr).toOutput('Link Git repository at ');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Which team?');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(`Fetching Projects for ${repoUrl}`);
      await expect(client.stderr).toOutput(
        `Found 1 Project linked to ${repoUrl}`
      );
      await expect(client.stderr).toOutput(
        `Which Projects should be linked to?`
      );
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        `✓ Linked          1 Project under ${user.username}`
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      const repoJson = await readJSON(join(cwd, '.vercel/repo.json'));
      expect(repoJson).toMatchObject({
        projects: [
          {
            directory: '.',
            id: project.id,
            name: project.name,
            orgId: user.id,
          },
        ],
        remoteName: 'upstream',
      });
      expect(repoJson.orgId).toBeUndefined();
    });

    it('should create new Project at repo root using repo folder name', async () => {
      const user = useUser();
      const cwd = setupTmpDir();

      // Set up a `.git/config` file to simulate a repo
      await mkdirp(join(cwd, '.git'));
      const repoUrl = 'https://github.com/user/repo.git';
      await writeFile(
        join(cwd, '.git/config'),
        `[remote "upstream"]\n\turl = ${repoUrl}\n\tfetch = +refs/heads/*:refs/remotes/upstream/*\n`
      );

      // Set up the root-level `package.json` to simulate a Next.js project
      await writeJSON(join(cwd, 'package.json'), {
        dependencies: {
          next: 'latest',
        },
      });

      useTeams('team_dummy');
      useUnknownProject();
      client.scenario.get(`/v9/projects`, (_req, res) => {
        res.json({
          projects: [],
          pagination: { count: 0, next: null, prev: null },
        });
      });

      client.cwd = cwd;
      client.setArgv('--repo');
      const exitCodePromise = link(client);

      await expect(client.stderr).toOutput(
        'The `--repo` flag is in alpha, please report issues'
      );

      await expect(client.stderr).toOutput('Link Git repository at ');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Which team?');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(`Fetching Projects for ${repoUrl}`);
      await expect(client.stderr).toOutput(`No Projects are linked`);
      await expect(client.stderr).toOutput(
        `Detected 1 new Project that may be created.`
      );
      await expect(client.stderr).toOutput(`Which Projects should be created?`);
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        `✓ Linked          1 Project under ${user.username}`
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      const repoJson = await readJSON(join(cwd, '.vercel/repo.json'));
      expect(repoJson.orgId).toBeUndefined();
      expect(repoJson.remoteName).toEqual('upstream');
      expect(repoJson.projects).toHaveLength(1);
      expect(repoJson.projects[0].directory).toEqual('.');
      expect(repoJson.projects[0].orgId).toEqual(user.id);
      const project = await getProjectByNameOrId(
        client,
        repoJson.projects[0].id
      );
      if (project instanceof ProjectNotFound) {
        throw project;
      }
      expect(project.name).toEqual(repoJson.projects[0].name);
      expect(project.name).toEqual(basename(cwd));
      expect(project.framework).toEqual('nextjs');
      expect(project.link?.repo).toEqual('user/repo');
      expect(project.link?.type).toEqual('github');
    });

    it('should create projects using subdirectory names for monorepo workspaces', async () => {
      const user = useUser();
      const cwd = setupTmpDir();

      await mkdirp(join(cwd, '.git'));
      const repoUrl = 'https://github.com/user/repo.git';
      await writeFile(
        join(cwd, '.git/config'),
        `[remote "origin"]\n\turl = ${repoUrl}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`
      );

      await writeJSON(join(cwd, 'package.json'), {
        name: 'my-monorepo',
        private: true,
        workspaces: ['packages/frontend', 'packages/api'],
      });

      await mkdirp(join(cwd, 'packages/frontend'));
      await writeJSON(join(cwd, 'packages/frontend/package.json'), {
        name: 'frontend',
        dependencies: {
          next: 'latest',
        },
      });

      await mkdirp(join(cwd, 'packages/api'));
      await writeJSON(join(cwd, 'packages/api/package.json'), {
        name: 'api',
        dependencies: {
          '@remix-run/dev': 'latest',
        },
      });

      useTeams('team_dummy');
      useUnknownProject();
      client.scenario.get(`/v9/projects`, (_req, res) => {
        res.json({
          projects: [],
          pagination: { count: 0, next: null, prev: null },
        });
      });

      client.cwd = cwd;
      client.setArgv('--repo');
      const exitCodePromise = link(client);

      await expect(client.stderr).toOutput(
        'The `--repo` flag is in alpha, please report issues'
      );

      await expect(client.stderr).toOutput('Link Git repository at ');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Which team?');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(`Fetching Projects for ${repoUrl}`);
      await expect(client.stderr).toOutput(`No Projects are linked`);
      await expect(client.stderr).toOutput(
        `Detected 2 new Projects that may be created.`
      );
      await expect(client.stderr).toOutput(`Which Projects should be created?`);
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        `✓ Linked          2 Projects under ${user.username}`
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      const repoJson = await readJSON(join(cwd, '.vercel/repo.json'));
      expect(repoJson.orgId).toBeUndefined();
      expect(repoJson.remoteName).toEqual('origin');
      expect(repoJson.projects).toHaveLength(2);
      expect(repoJson.projects[0].orgId).toEqual(user.id);
      expect(repoJson.projects[1].orgId).toEqual(user.id);

      const frontendProject = repoJson.projects.find(
        (p: any) => p.name === 'frontend'
      );
      const apiProject = repoJson.projects.find((p: any) => p.name === 'api');

      expect(frontendProject).toBeDefined();
      expect(apiProject).toBeDefined();

      const frontendProjectDetails = await getProjectByNameOrId(
        client,
        frontendProject.id
      );
      const apiProjectDetails = await getProjectByNameOrId(
        client,
        apiProject.id
      );

      if (
        frontendProjectDetails instanceof ProjectNotFound ||
        apiProjectDetails instanceof ProjectNotFound
      ) {
        throw new Error('Projects not found');
      }

      expect(frontendProjectDetails.framework).toEqual('nextjs');
      expect(apiProjectDetails.framework).toEqual('remix');
    });

    it('should gracefully report error when creating new Project fails', async () => {
      useUser();
      const cwd = setupTmpDir();

      // Set up a `.git/config` file to simulate a repo
      await mkdirp(join(cwd, '.git'));
      const repoUrl = 'https://github.com/user/repo.git';
      await writeFile(
        join(cwd, '.git/config'),
        `[remote "upstream"]\n\turl = ${repoUrl}\n\tfetch = +refs/heads/*:refs/remotes/upstream/*\n`
      );

      // Set up the root-level `package.json` to simulate a Next.js project
      await writeJSON(join(cwd, 'package.json'), {
        dependencies: {
          next: 'latest',
        },
      });

      useTeams('team_dummy');
      client.scenario.get(`/v9/projects`, (_req, res) => {
        res.json({
          projects: [],
          pagination: { count: 0, next: null, prev: null },
        });
      });
      client.scenario.post(`/v1/projects`, (_req, res) => {
        res.status(400).send();
      });

      client.cwd = cwd;
      client.setArgv('link', '--repo');
      const exitCodePromise = link(client);

      await expect(client.stderr).toOutput(
        'The `--repo` flag is in alpha, please report issues'
      );

      await expect(client.stderr).toOutput('Link Git repository at ');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Which team?');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(`Fetching Projects for ${repoUrl}`);
      await expect(client.stderr).toOutput(`No Projects are linked`);
      await expect(client.stderr).toOutput(
        `Detected 1 new Project that may be created.`
      );
      await expect(client.stderr).toOutput(`Which Projects should be created?`);
      client.stdin.write('\n');

      // This next step should fail because `POST /v1/projects` returns a 400
      await expect(client.stderr).toOutput('Error: Response Error (400)');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(1);
    });

    it('should track use of `--repo` flag', async () => {
      useUser();
      const cwd = setupTmpDir();

      // Set up a `.git/config` file to simulate a repo
      await mkdirp(join(cwd, '.git'));
      const repoUrl = 'https://github.com/test/test.git';
      await writeFile(
        join(cwd, '.git/config'),
        `[remote "upstream"]\n\turl = ${repoUrl}\n\tfetch = +refs/heads/*:refs/remotes/upstream/*\n`
      );

      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: basename(cwd),
        name: basename(cwd),
      });
      useUnknownProject();

      client.cwd = cwd;
      client.setArgv('--repo', '--yes');
      const exitCode = await link(client);
      expect(exitCode, 'exit code for "link"').toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:repo',
          value: 'TRUE',
        },
        {
          key: 'flag:yes',
          value: 'TRUE',
        },
      ]);
    });
  });

  describe('add', () => {
    it('should fail if repo.json does not exist', async () => {
      useUser();
      const cwd = setupTmpDir();

      // Set up a `.git/config` file to simulate a repo (but no .vercel/repo.json)
      await mkdirp(join(cwd, '.git'));
      const repoUrl = 'https://github.com/test/test.git';
      await writeFile(
        join(cwd, '.git/config'),
        `[remote "origin"]\n\turl = ${repoUrl}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`
      );

      useTeams('team_dummy');
      useUnknownProject();

      client.cwd = cwd;
      client.setArgv('link', 'add', '--yes');
      const exitCode = await link(client);

      await expect(client.stderr).toOutput('No existing repository link found');
      expect(exitCode).toEqual(1);
    });

    it('should add projects to existing repo.json', async () => {
      const user = useUser();
      const cwd = setupTmpDir();

      // Set up a `.git/config` file to simulate a repo
      await mkdirp(join(cwd, '.git'));
      const repoUrl = 'https://github.com/user/repo.git';
      await writeFile(
        join(cwd, '.git/config'),
        `[remote "origin"]\n\turl = ${repoUrl}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`
      );

      // Create an existing repo.json with one project
      await mkdirp(join(cwd, '.vercel'));
      await writeJSON(join(cwd, '.vercel/repo.json'), {
        remoteName: 'origin',
        projects: [
          {
            id: 'existing-project-id',
            name: 'existing-project',
            directory: 'packages/existing',
            orgId: user.id,
          },
        ],
      });

      useTeams('team_dummy');
      const { project: newProject } = useProject({
        ...defaultProject,
        id: 'new-project-id',
        name: 'new-project',
      });
      useUnknownProject();

      client.cwd = cwd;
      client.setArgv('link', 'add');
      const exitCodePromise = link(client);

      await expect(client.stderr).toOutput(
        'Add Project(s) for Git repository at '
      );
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Which team?');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(`Fetching Projects for ${repoUrl}`);
      await expect(client.stderr).toOutput(
        `Found 1 Project linked to ${repoUrl}`
      );
      await expect(client.stderr).toOutput(
        `Which Projects should be linked to?`
      );
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('✓ Added           1 Project under');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      const repoJson = await readJSON(join(cwd, '.vercel/repo.json'));
      // Original project should still be there
      expect(repoJson.projects).toHaveLength(2);
      expect(repoJson.projects[0]).toMatchObject({
        id: 'existing-project-id',
        name: 'existing-project',
        directory: 'packages/existing',
        orgId: user.id,
      });
      // New project should be added
      expect(repoJson.projects[1]).toMatchObject({
        id: newProject.id,
        name: newProject.name,
        orgId: user.id,
      });
    });

    it('should not duplicate already-linked projects', async () => {
      const user = useUser();
      const cwd = setupTmpDir();

      // Set up a `.git/config` file to simulate a repo
      await mkdirp(join(cwd, '.git'));
      const repoUrl = 'https://github.com/user/repo.git';
      await writeFile(
        join(cwd, '.git/config'),
        `[remote "origin"]\n\turl = ${repoUrl}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`
      );

      // Create repo.json with a project that already matches what the API returns
      const existingProjectId = basename(cwd);
      await mkdirp(join(cwd, '.vercel'));
      await writeJSON(join(cwd, '.vercel/repo.json'), {
        remoteName: 'origin',
        projects: [
          {
            id: existingProjectId,
            name: basename(cwd),
            directory: '.',
            orgId: user.id,
          },
        ],
      });

      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: existingProjectId,
        name: basename(cwd),
      });
      useUnknownProject();

      client.cwd = cwd;
      client.setArgv('link', 'add', '--yes');
      const exitCode = await link(client);

      expect(exitCode).toEqual(0);

      // Should still have only the original project (the API project was filtered)
      const repoJson = await readJSON(join(cwd, '.vercel/repo.json'));
      expect(repoJson.projects).toHaveLength(1);
      expect(repoJson.projects[0].id).toEqual(existingProjectId);
    });

    it('should not show detected projects for directories already linked to another org', async () => {
      useUser();
      const cwd = setupTmpDir();

      // Set up a `.git/config` file to simulate a repo
      await mkdirp(join(cwd, '.git'));
      const repoUrl = 'https://github.com/user/repo.git';
      await writeFile(
        join(cwd, '.git/config'),
        `[remote "origin"]\n\turl = ${repoUrl}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`
      );

      // Create a Next.js project at repo root that would normally be detected
      await writeJSON(join(cwd, 'package.json'), {
        dependencies: { next: 'latest' },
      });

      // Create repo.json where the root directory is already linked to a different org
      await mkdirp(join(cwd, '.vercel'));
      await writeJSON(join(cwd, '.vercel/repo.json'), {
        remoteName: 'origin',
        projects: [
          {
            id: 'other-org-project',
            name: 'other-org-project',
            directory: '.',
            orgId: 'team_other',
          },
        ],
      });

      useTeams('team_dummy');
      // API returns no projects for this org
      client.scenario.get(`/v9/projects`, (_req, res) => {
        res.json({
          projects: [],
          pagination: { count: 0, next: null, prev: null },
        });
      });
      useUnknownProject();

      client.cwd = cwd;
      client.setArgv('link', 'add', '--yes');
      const exitCode = await link(client);
      expect(exitCode).toEqual(0);

      // The root directory project should NOT have been re-created because
      // it's already linked (to a different org). repo.json should be unchanged.
      const repoJson = await readJSON(join(cwd, '.vercel/repo.json'));
      expect(repoJson.projects).toHaveLength(1);
      expect(repoJson.projects[0].id).toEqual('other-org-project');
      expect(repoJson.projects[0].orgId).toEqual('team_other');
    });

    it('should track `add` subcommand telemetry', async () => {
      useUser();
      const cwd = setupTmpDir();

      // Set up a `.git/config` file to simulate a repo
      await mkdirp(join(cwd, '.git'));
      const repoUrl = 'https://github.com/user/repo.git';
      await writeFile(
        join(cwd, '.git/config'),
        `[remote "origin"]\n\turl = ${repoUrl}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`
      );

      // Create an existing repo.json
      await mkdirp(join(cwd, '.vercel'));
      await writeJSON(join(cwd, '.vercel/repo.json'), {
        remoteName: 'origin',
        projects: [],
      });

      useTeams('team_dummy');
      // Return no projects from API, so the flow will see 0 projects
      client.scenario.get(`/v9/projects`, (_req, res) => {
        res.json({
          projects: [],
          pagination: { count: 0, next: null, prev: null },
        });
      });
      useUnknownProject();

      client.cwd = cwd;
      client.setArgv('link', 'add', '--yes');
      const exitCode = await link(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:add',
          value: 'add',
        },
      ]);
    });
  });

  describe('--project', () => {
    it('should allow specifying `--project` flag', async () => {
      const cwd = setupTmpDir();
      useUser({ version: 'northstar' });
      const [team] = useTeams('team_dummy') as Team[];
      const { project } = useProject({
        ...defaultProject,
        id: basename(cwd),
        name: basename(cwd),
      });
      useUnknownProject();

      client.cwd = cwd;
      client.setArgv('--project', project.name!, '--yes');
      const exitCodePromise = link(client);

      await expect(client.stderr).toOutput('Which team?');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        `✓ Linked          ${team.slug}/${project.name}`
      );

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "link"').toEqual(0);

      const projectJson = await readJSON(join(cwd, '.vercel/project.json'));
      expect(projectJson.orgId).toEqual(team.id);
      expect(projectJson.projectId).toEqual(project.id);
      expect(projectJson.projectName).toEqual(project.name);

      // Verify env pull was called with --yes flag and correct source
      expect(mockPull).toHaveBeenCalledWith(
        expect.objectContaining({ cwd }),
        ['--yes'],
        'vercel-cli:link',
        { oidcTokenOnly: true }
      );
    });

    it('should track use of redacted `--project` option', async () => {
      const cwd = setupTmpDir();
      useUser();
      useTeams('team_dummy');
      const { project } = useProject({
        ...defaultProject,
        id: basename(cwd),
        name: basename(cwd),
      });
      useUnknownProject();

      client.cwd = cwd;
      client.setArgv('--project', project.name!, '--yes');
      const exitCodePromise = link(client);
      await expect(client.stderr).toOutput('Which team?');
      client.stdin.write('\n');
      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "link"').toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:yes',
          value: 'TRUE',
        },
        {
          key: 'option:project',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--yes', () => {
    it('should still require an explicit team choice with `--yes`', async () => {
      useUser({ version: 'northstar' });
      const cwd = setupTmpDir();
      const [team] = useTeams('team_dummy') as Team[];
      const { project } = useProject({
        ...defaultProject,
        id: basename(cwd),
        name: basename(cwd),
      });
      useUnknownProject();

      client.cwd = cwd;
      client.setArgv('--yes');
      const exitCodePromise = link(client);

      await expect(client.stderr).toOutput('Which team?');
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Which project?');
      client.stdin.write('\n');
      await expect(client.stderr).toOutput(
        `✓ Linked          ${team.slug}/${project.name}`
      );

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "link"').toEqual(0);

      const projectJson = await readJSON(join(cwd, '.vercel/project.json'));
      expect(projectJson.orgId).toEqual(team.id);
      expect(projectJson.projectId).toEqual(project.id);
      expect(projectJson.projectName).toEqual(project.name);

      const gitignore = await readFile(join(cwd, '.gitignore'), 'utf8');
      expect(gitignore).toBe(`.vercel${EOL}`);
      expect(await pathExists(join(cwd, '.vercel/README.txt'))).toBe(true);
    });

    it('should track use of `--yes` flag', async () => {
      useUser();
      const cwd = setupTmpDir();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: basename(cwd),
        name: basename(cwd),
      });
      useUnknownProject();

      client.cwd = cwd;
      client.setArgv('--yes');
      const exitCodePromise = link(client);
      await expect(client.stderr).toOutput('Which team?');
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Which project?');
      client.stdin.write('\n');
      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "link"').toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:yes',
          value: 'TRUE',
        },
      ]);
    });
  });

  describe('--non-interactive', () => {
    it('outputs action_required JSON when no scope is explicit', async () => {
      const cwd = setupTmpDir();
      client.cwd = cwd;
      client.setArgv('link', '--non-interactive');
      (client as { nonInteractive: boolean }).nonInteractive = true;

      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: number) => {
          throw new Error(`process.exit(${code})`);
        });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(link(client)).rejects.toThrow('process.exit(1)');

      expect(logSpy).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(logSpy.mock.calls[0][0]);
      expect(payload.status).toBe('action_required');
      expect(payload.reason).toBe('missing_scope');
      expect(payload.userActionRequired).toBe(true);
      expect(payload.message).toContain('selected by the user');
      expect(payload.message).toContain('Do not choose');
      expect(payload.choices).toBeUndefined();
      expect(payload.next).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            command: expect.stringContaining('teams list'),
          }),
        ])
      );
      expect(payload.next).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ command: expect.stringContaining('link') }),
          expect.objectContaining({
            command: expect.stringContaining('project add'),
          }),
        ])
      );
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      logSpy.mockRestore();
      (client as { nonInteractive: boolean }).nonInteractive = false;
    });
  });

  describe('prompt cancellation', () => {
    it('cancels with Escape before linking', async () => {
      const cwd = setupTmpDir();
      useUser({ version: 'northstar' });
      useTeams('team_dummy');
      useUnknownProject();

      client.cwd = cwd;
      const exitCodePromise = link(client);

      await expect(client.stderr).toOutput('Which team?');
      client.events.keypress('escape');

      await expect(exitCodePromise).resolves.toEqual(0);
      await expect(client.stderr).toOutput('Canceled.');
      expect(await pathExists(join(cwd, '.vercel/project.json'))).toBe(false);
    });

    it('cancels with Escape from the project picker without linking', async () => {
      const cwd = setupTmpDir();
      useUser({ version: 'northstar' });
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'project-id',
        name: 'project-name',
      });
      useUnknownProject();

      client.cwd = cwd;
      const exitCodePromise = link(client);

      await expect(client.stderr).toOutput('Which team?');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('Which project?');
      client.events.keypress('escape');

      await expect(exitCodePromise).resolves.toEqual(0);
      await expect(client.stderr).toOutput('Canceled.');
      expect(await pathExists(join(cwd, '.vercel/project.json'))).toBe(false);
    });
  });

  describe('--confirm', () => {
    it('should track use of `--confirm` flag', async () => {
      useUser();
      const cwd = setupTmpDir();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: basename(cwd),
        name: basename(cwd),
      });
      useUnknownProject();

      client.cwd = cwd;
      client.setArgv('--confirm');
      (client as { nonInteractive: boolean }).nonInteractive = false;
      const exitCodePromise = link(client);
      await expect(client.stderr).toOutput('Which team?');
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Which project?');
      client.stdin.write('\n');
      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "link"').toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:confirm',
          value: 'TRUE',
        },
      ]);
    });
  });

  it('should prompt for link', async () => {
    useUser({ version: 'northstar' });
    const cwd = setupTmpDir();
    const [team] = useTeams('team_dummy') as Team[];
    const { project } = useProject({
      ...defaultProject,
      id: basename(cwd),
      name: basename(cwd),
    });
    useUnknownProject();

    client.cwd = cwd;
    const exitCodePromise = link(client);

    await expect(client.stderr).toOutput('Which team?');
    client.stdin.write('\n');
    await expect(client.stderr).toOutput('Which project?');
    await expect(client.stderr).toOutput('(folder name)');
    await expect(client.stderr).toOutput('Search all projects');
    client.stdin.write('\n');

    await expect(client.stderr).toOutput(
      `✓ Linked          ${team.slug}/${project.name}`
    );
    expect(stripAnsi(client.stderr.getFullOutput())).not.toMatch(
      /^\s{0,2}Config\s+\.vercel\/project\.json/m
    );

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "link"').toEqual(0);
    const plainOutput = stripAnsi(client.stderr.getFullOutput());
    expect(plainOutput.indexOf('Directory')).toBeLessThan(
      plainOutput.indexOf('Which team?')
    );
    expect(plainOutput.indexOf('Which team?')).toBeLessThan(
      plainOutput.indexOf('Which project?')
    );
    expect(plainOutput).toContain('Create a new project');
    expect(plainOutput).not.toContain(
      'Pull development environment variables into .env.local?'
    );
    expectLinkRowsUseExpectedGlyphs(client.stderr.getFullOutput(), [
      'Directory',
      'Linked',
    ]);

    const projectJson = await readJSON(join(cwd, '.vercel/project.json'));
    expect(projectJson.orgId).toEqual(team.id);
    expect(projectJson.projectId).toEqual(project.id);
    expect(projectJson.projectName).toEqual(project.name);
    expect(client.stderr.getFullOutput()).not.toContain(
      'Would you like to pull environment variables now?'
    );
  });

  it('keeps non-matching projects behind Search all projects', async () => {
    useUser({ version: 'northstar' });
    const cwd = setupTmpDir();
    const [team] = useTeams('team_dummy') as Team[];
    const { project } = useProject({
      ...defaultProject,
      id: 'existing-project-id',
      name: 'existing-project',
    });
    useUnknownProject();

    client.cwd = cwd;
    const exitCodePromise = link(client);

    await expect(client.stderr).toOutput('Which team?');
    client.stdin.write('\n');
    await expect(client.stderr).toOutput('Which project?');

    const suggestedOutput = stripAnsi(client.stderr.getFullOutput());
    expect(suggestedOutput).toContain('Search all projects');
    expect(suggestedOutput).not.toContain(project.name!);

    client.stdin.write('\n');
    await expect(client.stderr).toOutput(project.name!);
    client.stdin.write('\n');

    await expect(exitCodePromise).resolves.toEqual(0);
    expect(await readJSON(join(cwd, '.vercel/project.json'))).toMatchObject({
      orgId: team.id,
      projectId: project.id,
    });
  });

  it('explicitly confirms project creation with --yes when the selected team has no projects', async () => {
    useUser({ version: 'northstar' });
    const cwd = setupTmpDir();
    const [team] = useTeams('team_dummy') as Team[];
    useUnknownProject();
    client.scenario.get('/v9/projects', (_req, res) => {
      res.json({
        projects: [],
        pagination: { count: 0, next: null, prev: null },
      });
    });

    client.cwd = cwd;
    client.setArgv('--yes');
    const exitCodePromise = link(client);

    await expect(client.stderr).toOutput('Which team?');
    client.stdin.write('\n');
    await expect(client.stderr).toOutput('Which project?');
    await expect(client.stderr).toOutput('Create a new project');
    client.stdin.write('\n');
    await expect(client.stderr).toOutput('Project name?');
    client.stdin.write('\n');
    await expect(client.stderr).toOutput(
      `Create ${team.slug}/${basename(cwd)}?`
    );
    client.stdin.write('\n');

    await expect(exitCodePromise).resolves.toEqual(0);
    const outputText = stripAnsi(client.stderr.getFullOutput());
    expect(outputText).toContain(`${team.slug}/${basename(cwd)}`);
    expectLinkRowsUseExpectedGlyphs(client.stderr.getFullOutput(), ['Created']);
    expect(await readJSON(join(cwd, '.vercel/project.json'))).toMatchObject({
      orgId: team.id,
      projectId: basename(cwd),
      projectName: basename(cwd),
    });
  });

  it("shows access help when the team isn't listed", async () => {
    useUser({ version: 'northstar' });
    const cwd = setupTmpDir();
    useTeams('team_dummy');
    useUnknownProject();

    client.cwd = cwd;
    const exitCodePromise = link(client);

    await expect(client.stderr).toOutput('Which team?');
    client.stdin.write('missing-team');
    await expect(client.stderr).toOutput('missing-team');
    client.stdin.write('\n');

    await expect(exitCodePromise).resolves.toEqual(1);
    const outputText = stripAnsi(client.stderr.getFullOutput());
    expect(outputText).toContain("My team isn't listed");
    expect(outputText).toContain('No team selected.');
    expect(outputText).toContain('whoami');
    expect(outputText).toContain('teams list');
    expect(outputText).not.toContain('Which project?');
    expect(await pathExists(join(cwd, '.vercel/project.json'))).toBe(false);
  });

  it('shows explicit commands when none of the projects match', async () => {
    useUser({ version: 'northstar' });
    const cwd = setupTmpDir();
    const [team] = useTeams('team_dummy') as Team[];
    useProject({
      ...defaultProject,
      id: 'project-id',
      name: 'existing-project',
    });
    useUnknownProject();

    client.cwd = cwd;
    const exitCodePromise = link(client);

    await expect(client.stderr).toOutput('Which team?');
    client.stdin.write('\n');
    await expect(client.stderr).toOutput('Which project?');
    client.stdin.write('\n');
    await expect(client.stderr).toOutput('existing-project');
    client.stdin.write('missing-project');
    await expect(client.stderr).toOutput('missing-project');
    client.events.keypress('down');
    client.stdin.write('\n');

    await expect(exitCodePromise).resolves.toEqual(1);
    const outputText = stripAnsi(client.stderr.getFullOutput());
    expect(outputText).toContain('None of these projects');
    expect(outputText).toContain('No project selected.');
    expect(outputText).toContain(
      `project add <project-name> --scope ${team.slug}`
    );
    expect(outputText).toContain(
      `link --scope ${team.slug} --project <project-name>`
    );
    expect(await pathExists(join(cwd, '.vercel/project.json'))).toBe(false);
  });

  it('should allow overwriting existing link', async () => {
    const cwd = setupTmpDir();
    useUser({ version: 'northstar' });
    const [team] = useTeams('team_dummy') as Team[];
    const { project: proj1 } = useProject({
      ...defaultProject,
      id: 'one',
      name: 'one',
    });
    const { project: proj2 } = useProject({
      ...defaultProject,
      id: 'two',
      name: 'two',
    });
    useUnknownProject();

    client.cwd = cwd;
    client.setArgv('--project', proj1.name!, '--yes');
    const exitCodeLink1Promise = link(client);
    await expect(client.stderr).toOutput('Which team?');
    client.stdin.write('\n');
    const exitCodeLink1 = await exitCodeLink1Promise;
    expect(exitCodeLink1, 'exit code for "link"').toEqual(0);

    let projectJson = await readJSON(join(cwd, '.vercel/project.json'));
    expect(projectJson.orgId).toEqual(team.id);
    expect(projectJson.projectId).toEqual(proj1.id);
    expect(projectJson.projectName).toEqual(proj1.name);

    client.setArgv('--project', proj2.name!, '--yes');
    const exitCodeLink2Promise = link(client);
    await expect(client.stderr).toOutput('Which team?');
    client.stdin.write('\n');
    const exitCodeLink2 = await exitCodeLink2Promise;
    expect(exitCodeLink2, 'exit code for "link"').toEqual(0);

    projectJson = await readJSON(join(cwd, '.vercel/project.json'));
    expect(projectJson.orgId).toEqual(team.id);
    expect(projectJson.projectId).toEqual(proj2.id);
    expect(projectJson.projectName).toEqual(proj2.name);
  });

  it('should track use of deprecated `cwd` positional argument', async () => {
    useUser();
    const cwd = setupTmpDir();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: basename(cwd),
      name: basename(cwd),
    });
    useUnknownProject();

    client.setArgv('link', cwd, '--yes');
    const exitCodePromise = link(client);
    await expect(client.stderr).toOutput(
      `The \`vc link <directory>\` syntax is deprecated, please use \`vc link --cwd ${cwd}\` instead`
    );
    await expect(client.stderr).toOutput('Which team?');
    client.stdin.write('\n');
    await expect(client.stderr).toOutput('Which project?');
    client.stdin.write('\n');

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "link"').toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'flag:yes',
        value: 'TRUE',
      },
      {
        key: 'argument:cwd',
        value: '[REDACTED]',
      },
    ]);
  });

  describe('repo.json interaction', () => {
    it('should not prompt to select a repo-linked project during `vc link`', async () => {
      useUser({ version: 'northstar' });
      const repoRoot = setupTmpDir();
      const cwd = join(repoRoot, 'apps', 'docs');

      // Create a repo.json that would normally cause the repo-link resolver
      // to prompt ("Please select a Project:") due to ambiguous matches.
      await mkdirp(join(repoRoot, '.vercel'));
      await writeJSON(join(repoRoot, '.vercel/repo.json'), {
        remoteName: 'origin',
        projects: [
          {
            id: 'repo-proj-1',
            name: 'repo-proj-1',
            directory: '.',
            orgId: 'team_dummy',
          },
          {
            id: 'repo-proj-2',
            name: 'repo-proj-2',
            directory: '.',
            orgId: 'team_dummy',
          },
        ],
      });

      await mkdirp(cwd);

      const [team] = useTeams('team_dummy') as Team[];
      const { project } = useProject({
        ...defaultProject,
        id: 'docs-project-id',
        name: 'docs',
      });
      useUnknownProject();

      client.cwd = cwd;
      client.setArgv();

      const originalSelect = client.input.select.bind(client.input);
      const toCancelablePromise = <T>(value: T) => {
        // Inquirer prompts return a `CancelablePromise`. For this test we sometimes
        // need to short-circuit a prompt while still matching the return type.
        const p = Promise.resolve(value) as any;
        p.cancel = () => {};
        return p as ReturnType<typeof originalSelect>;
      };
      let sawRepoProjectSelector = false;
      const selectSpy = vi.spyOn(client.input, 'select').mockImplementation(((
        opts: any
      ) => {
        if (opts?.message === 'Please select a Project:') {
          sawRepoProjectSelector = true;
          return toCancelablePromise(opts.choices[0].value);
        }
        return originalSelect(opts);
      }) as typeof client.input.select);

      const exitCodePromise = link(client);

      await expect(client.stderr).toOutput('Which team?');
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Which project?');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        `✓ Linked          ${team.slug}/${project.name}`
      );

      const exitCode = await exitCodePromise;
      selectSpy.mockRestore();

      expect(exitCode).toEqual(0);
      expectLinkRowsUseExpectedGlyphs(client.stderr.getFullOutput(), [
        'Linked',
      ]);
      expect(sawRepoProjectSelector).toBe(false);
      expect(client.stderr.getFullOutput()).not.toContain(
        'Please select a Project:'
      );
    });
  });

  describe('OIDC token refresh', () => {
    it('refreshes OIDC automatically after successful linking', async () => {
      useUser({ version: 'northstar' });
      const cwd = setupTmpDir();
      const [team] = useTeams('team_dummy') as Team[];
      const { project } = useProject({
        ...defaultProject,
        id: basename(cwd),
        name: basename(cwd),
      });
      useUnknownProject();

      client.cwd = cwd;
      client.setArgv('--project', project.name!);
      const exitCodePromise = link(client);

      await expect(client.stderr).toOutput('Which team?');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        `✓ Linked          ${team.slug}/${project.name}`
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      expect(mockPull).toHaveBeenCalledWith(
        expect.objectContaining({ cwd }),
        ['--yes'],
        'vercel-cli:link',
        { oidcTokenOnly: true }
      );
      expect(client.stderr.getFullOutput()).not.toContain(
        'Pull development environment variables into .env.local?'
      );
    });

    it('warns without failing when the OIDC refresh fails', async () => {
      useUser({ version: 'northstar' });
      const cwd = setupTmpDir();
      const [team] = useTeams('team_dummy') as Team[];
      const { project } = useProject({
        ...defaultProject,
        id: basename(cwd),
        name: basename(cwd),
      });
      useUnknownProject();

      // Mock the OIDC refresh to fail after linking succeeds.
      mockPull.mockResolvedValue(1);

      client.cwd = cwd;
      client.setArgv('--project', project.name!);
      const exitCodePromise = link(client);

      await expect(client.stderr).toOutput('Which team?');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        `✓ Linked          ${team.slug}/${project.name}`
      );

      await expect(client.stderr).toOutput(
        'Linked project, but failed to refresh VERCEL_OIDC_TOKEN in .env.local.'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      expect(mockPull).toHaveBeenCalledWith(
        expect.objectContaining({ cwd }),
        ['--yes'],
        'vercel-cli:link',
        { oidcTokenOnly: true }
      );
      const plainOutput = stripAnsi(client.stderr.getFullOutput());
      expect(plainOutput).toMatch(
        /^! Linked project, but failed to refresh VERCEL_OIDC_TOKEN/m
      );
      expect(plainOutput).not.toContain('WARNING!');
    });

    it('restores the working directory when the OIDC refresh throws', async () => {
      useUser({ version: 'northstar' });
      const cwd = setupTmpDir();
      const [team] = useTeams('team_dummy') as Team[];
      const { project } = useProject({
        ...defaultProject,
        id: basename(cwd),
        name: basename(cwd),
      });
      useUnknownProject();

      mockPull.mockImplementation(() => {
        throw new Error('Env pull failed');
      });

      client.cwd = cwd;
      const originalCwd = client.cwd;
      client.setArgv('--project', project.name!);
      const exitCodePromise = link(client);

      await expect(client.stderr).toOutput('Which team?');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        `✓ Linked          ${team.slug}/${project.name}`
      );

      await expect(client.stderr).toOutput(
        'Linked project, but failed to refresh VERCEL_OIDC_TOKEN in .env.local.'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      expect(client.cwd).toEqual(originalCwd);
    });
  });

  describe('team-first target resolution', () => {
    it('asks for the team before searching for projects', async () => {
      useUser({ version: 'northstar' });
      const cwd = setupTmpDir();
      const [teamA] = useTeams('team_a') as Team[];
      const teamB = createTeam('team_b', 'team-b', 'Team B');
      const { project } = useProject({
        ...defaultProject,
        id: basename(cwd),
        name: basename(cwd),
      });
      useUnknownProject();

      client.config.currentTeam = teamA.id;
      client.cwd = cwd;
      const searchSpy = vi.spyOn(client.input, 'search');
      const exitCodePromise = link(client);

      await expect(client.stderr).toOutput('Which team?');
      expect(searchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Which team?' })
      );
      const teamPromptOutput = client.stderr.getFullOutput();
      expect(teamPromptOutput).toContain(teamA.name);
      expect(teamPromptOutput).toContain('Team B');
      expect(teamPromptOutput).not.toContain(`(${teamA.slug})`);
      expect(teamPromptOutput).not.toContain('(current)');
      expect(teamPromptOutput).not.toContain('Which project?');
      client.stdin.write('team-b');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('Which project?');
      client.stdin.write('\n');

      await expect(exitCodePromise).resolves.toEqual(0);
      const projectJson = await readJSON(join(cwd, '.vercel/project.json'));
      expect(projectJson).toMatchObject({
        orgId: teamB.id,
        projectId: project.id,
      });
      searchSpy.mockRestore();
    });

    it('lets an explicit --scope bypass the team prompt', async () => {
      useUser({ version: 'northstar' });
      const cwd = setupTmpDir();
      const [team] = useTeams('team_dummy') as Team[];
      const { project } = useProject({
        ...defaultProject,
        id: 'project-id',
        name: 'project-name',
      });
      useUnknownProject();

      client.config.currentTeam = team.id;
      client.cwd = cwd;
      client.setArgv('--scope', team.slug, '--project', project.name!);

      await expect(link(client)).resolves.toEqual(0);
      expect(client.stderr.getFullOutput()).not.toContain('Which team?');
      expect(await readJSON(join(cwd, '.vercel/project.json'))).toMatchObject({
        orgId: team.id,
        projectId: project.id,
      });
    });
  });

  describe('deterministic non-interactive linking', () => {
    it('treats a detected agent with a TTY as non-interactive for link only', async () => {
      useUser({ version: 'northstar' });
      const cwd = setupTmpDir();
      useTeams('team_dummy');
      useUnknownProject();

      client.isAgent = true;
      client.nonInteractive = false;
      client.stdin.isTTY = true;
      client.cwd = cwd;
      client.setArgv('link');

      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: number) => {
          throw new Error(`process.exit(${code})`);
        });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(link(client)).rejects.toThrow('process.exit(1)');
      const payload = JSON.parse(logSpy.mock.calls[0][0]);
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'missing_scope',
        userActionRequired: true,
      });
      expect(client.stderr.getFullOutput()).not.toContain('Which team?');
      expect(client.nonInteractive).toBe(false);

      exitSpy.mockRestore();
      logSpy.mockRestore();
      client.isAgent = false;
    });

    it('links an explicit --scope and --project without --yes', async () => {
      useUser({ version: 'northstar' });
      const cwd = setupTmpDir();
      const [team] = useTeams('team_dummy') as Team[];
      const { project } = useProject({
        ...defaultProject,
        id: 'project-id',
        name: 'project-name',
      });
      useUnknownProject();

      client.config.currentTeam = team.id;
      client.nonInteractive = true;
      client.cwd = cwd;
      client.setArgv(
        'link',
        '--non-interactive',
        '--scope',
        team.slug,
        '--project',
        project.name!
      );

      await expect(link(client)).resolves.toEqual(0);
      expect(await readJSON(join(cwd, '.vercel/project.json'))).toMatchObject({
        orgId: team.id,
        projectId: project.id,
      });
      expect(client.stderr.getFullOutput()).not.toContain('Which team?');
    });

    it('does not treat currentTeam as explicit scope', async () => {
      useUser({ version: 'northstar' });
      const cwd = setupTmpDir();
      const [team] = useTeams('team_dummy') as Team[];
      useUnknownProject();

      client.config.currentTeam = team.id;
      client.nonInteractive = true;
      client.cwd = cwd;
      client.setArgv('link', '--non-interactive', '--project', 'project-name');

      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: number) => {
          throw new Error(`process.exit(${code})`);
        });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(link(client)).rejects.toThrow('process.exit(1)');
      const payload = JSON.parse(logSpy.mock.calls[0][0]);
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'missing_scope',
      });

      exitSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('reuses an authoritative local owner-project pair', async () => {
      useUser({ version: 'northstar' });
      const cwd = setupTmpDir();
      const [team] = useTeams('team_dummy') as Team[];
      const { project } = useProject({
        ...defaultProject,
        id: 'project-id',
        name: 'project-name',
      });
      useUnknownProject();
      await mkdirp(join(cwd, '.vercel'));
      await writeJSON(join(cwd, '.vercel/project.json'), {
        orgId: team.id,
        projectId: project.id,
        projectName: project.name,
      });

      client.nonInteractive = true;
      client.cwd = cwd;
      client.setArgv('link', '--non-interactive');

      await expect(link(client)).resolves.toEqual(0);
      expect(mockPull).toHaveBeenCalledWith(
        expect.objectContaining({ cwd }),
        ['--yes'],
        'vercel-cli:link',
        { oidcTokenOnly: true }
      );
      expect(client.stderr.getFullOutput()).not.toContain('Which team?');
    });

    it('does not let --yes create or select a project', async () => {
      useUser({ version: 'northstar' });
      const cwd = setupTmpDir();
      const [team] = useTeams('team_dummy') as Team[];
      useUnknownProject();

      client.nonInteractive = true;
      client.cwd = cwd;
      client.setArgv(
        'link',
        '--non-interactive',
        '--scope',
        team.slug,
        '--yes'
      );

      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: number) => {
          throw new Error(`process.exit(${code})`);
        });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(link(client)).rejects.toThrow('process.exit(1)');
      const payload = JSON.parse(logSpy.mock.calls[0][0]);
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'missing_project',
        userActionRequired: true,
      });
      expect(payload.message).toContain('selected by the user');
      expect(payload.message).toContain('Do not choose by list order');
      expect(payload.next).toEqual([
        expect.objectContaining({
          command: expect.stringContaining(`project list --scope ${team.slug}`),
        }),
      ]);
      expect(payload.next[0].command).not.toContain('project add');
      expect(payload.next[0].command).not.toContain('link');
      expect(await pathExists(join(cwd, '.vercel/project.json'))).toBe(false);

      exitSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('returns a human error on a non-TTY pipe without agent mode', async () => {
      const cwd = setupTmpDir();
      client.cwd = cwd;
      client.stdin.isTTY = false;
      client.setArgv('link');

      try {
        await expect(link(client)).resolves.toEqual(1);
        expect(stripAnsi(client.stderr.getFullOutput())).toContain(
          'A team must be selected by the user before linking.'
        );
        expect(client.stderr.getFullOutput()).not.toContain('Which team?');
      } finally {
        client.stdin.isTTY = true;
      }
    });
  });
});
