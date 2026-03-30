import { EOL } from 'node:os';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { basename, join } from 'path';
import { readFile } from 'fs-extra';
import {
  readJSON,
  mkdirp,
  writeFile,
  writeJSON,
  pathExists,
  remove,
} from 'fs-extra';
import link from '../../../../src/commands/link';
import pull from '../../../../src/commands/env/pull';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeams, createTeam } from '../../../mocks/team';
import {
  defaultProject,
  useProject,
  useUnknownProject,
} from '../../../mocks/project';
import {
  setupTmpDir,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';
import getProjectByNameOrId from '../../../../src/util/projects/get-project-by-id-or-name';
import { ProjectNotFound } from '../../../../src/util/errors-ts';

// Mock the env pull command
vi.mock('../../../../src/commands/env/pull');
const mockPull = vi.mocked(pull);

// Mock the auto-install agent tooling so it doesn't prompt during link tests
vi.mock('../../../../src/util/agent/auto-install-agentic', () => ({
  autoInstallAgentTooling: vi.fn().mockResolvedValue(undefined),
}));

describe('link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

      await expect(client.stderr).toOutput(
        'Which scope should contain your Project(s)?'
      );
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
        `Linked to 1 Project under ${user.username} (created .vercel and added it to .gitignore)`
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

      await expect(client.stderr).toOutput(
        'Which scope should contain your Project(s)?'
      );
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(`Fetching Projects for ${repoUrl}`);
      await expect(client.stderr).toOutput(`No Projects are linked`);
      await expect(client.stderr).toOutput(
        `Detected 1 new Project that may be created.`
      );
      await expect(client.stderr).toOutput(`Which Projects should be created?`);
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        `Linked to 1 Project under ${user.username} (created .vercel and added it to .gitignore)`
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

      await expect(client.stderr).toOutput(
        'Which scope should contain your Project(s)?'
      );
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(`Fetching Projects for ${repoUrl}`);
      await expect(client.stderr).toOutput(`No Projects are linked`);
      await expect(client.stderr).toOutput(
        `Detected 2 new Projects that may be created.`
      );
      await expect(client.stderr).toOutput(`Which Projects should be created?`);
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        `Linked to 2 Projects under ${user.username} (created .vercel and added it to .gitignore)`
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

      await expect(client.stderr).toOutput(
        'Which scope should contain your Project(s)?'
      );
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

      await expect(client.stderr).toOutput(
        'Which scope should contain your Project(s)?'
      );
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(`Fetching Projects for ${repoUrl}`);
      await expect(client.stderr).toOutput(
        `Found 1 Project linked to ${repoUrl}`
      );
      await expect(client.stderr).toOutput(
        `Which Projects should be linked to?`
      );
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Added 1 Project under');

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
      const user = useUser();
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

      await expect(client.stderr).toOutput(
        `Linked to ${user.username}/${project.name} (created .vercel and added it to .gitignore)`
      );

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "link"').toEqual(0);

      const projectJson = await readJSON(join(cwd, '.vercel/project.json'));
      expect(projectJson.orgId).toEqual(user.id);
      expect(projectJson.projectId).toEqual(project.id);
      expect(projectJson.projectName).toEqual(project.name);

      // Verify env pull was called with --yes flag and correct source
      expect(mockPull).toHaveBeenCalledWith(
        expect.objectContaining({ cwd }),
        ['--yes'],
        'vercel-cli:link'
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
      const exitCode = await link(client);
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
    it('should skip prompts for link with `--yes`', async () => {
      const user = useUser();
      const cwd = setupTmpDir();
      useTeams('team_dummy');
      const { project } = useProject({
        ...defaultProject,
        id: basename(cwd),
        name: basename(cwd),
      });
      useUnknownProject();

      client.cwd = cwd;
      client.setArgv('--yes');
      const exitCodePromise = link(client);

      await expect(client.stderr).toOutput('Searching for existing projects');
      await expect(client.stderr).toOutput(
        `Linked to ${user.username}/${project.name} (created .vercel and added it to .gitignore)`
      );

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "link"').toEqual(0);

      expect(client.stderr).toOutput('Linked to ');

      const projectJson = await readJSON(join(cwd, '.vercel/project.json'));
      expect(projectJson.orgId).toEqual(user.id);
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
      const exitCode = await link(client);
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
    it('outputs action_required JSON and exits when not linked and multiple teams (no --team)', async () => {
      const cwd = setupTmpDir();
      useUser({ version: 'northstar' });
      useTeams('team_dummy');
      createTeam(); // second team so choices.length > 1, no currentTeam
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
      expect(payload.message).toContain('--scope');
      expect(payload.message).toContain('non-interactive');
      expect(Array.isArray(payload.choices)).toBe(true);
      expect(payload.choices.length).toBeGreaterThanOrEqual(2);
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      logSpy.mockRestore();
      (client as { nonInteractive: boolean }).nonInteractive = false;
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
      const exitCode = await link(client);
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
    const user = useUser();
    const cwd = setupTmpDir();
    useTeams('team_dummy');
    const { project } = useProject({
      ...defaultProject,
      id: basename(cwd),
      name: basename(cwd),
    });
    useUnknownProject();

    client.cwd = cwd;
    const exitCodePromise = link(client);

    await expect(client.stderr).toOutput('Set up');
    client.stdin.write('y\n');

    await expect(client.stderr).toOutput(
      'Which scope should contain your project?'
    );
    client.stdin.write('\n');

    await expect(client.stderr).toOutput('Link to it?');
    client.stdin.write('y\n');

    await expect(client.stderr).toOutput(
      `Linked to ${user.username}/${project.name} (created .vercel and added it to .gitignore)`
    );

    await expect(client.stderr).toOutput(
      'Would you like to pull environment variables now?'
    );
    client.stdin.write('n\n');

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "link"').toEqual(0);

    const projectJson = await readJSON(join(cwd, '.vercel/project.json'));
    expect(projectJson.orgId).toEqual(user.id);
    expect(projectJson.projectId).toEqual(project.id);
    expect(projectJson.projectName).toEqual(project.name);
  });

  it('should create new Project', async () => {
    const user = useUser();
    const cwd = setupUnitFixture('commands/build/monorepo');
    await remove(join(cwd, '.vercel'));
    useTeams('team_dummy');
    useUnknownProject();

    client.cwd = cwd;
    const exitCodePromise = link(client);

    await expect(client.stderr).toOutput('Set up');
    client.stdin.write('y\n');

    await expect(client.stderr).toOutput(
      'Which scope should contain your project?'
    );
    client.stdin.write('\n');

    await expect(client.stderr).toOutput('Link to existing project?');
    client.stdin.write('n\n');

    await expect(client.stderr).toOutput('What’s your project’s name?');
    client.stdin.write('awesome-app\n');

    await expect(client.stderr).toOutput(
      'In which directory is your code located? ./'
    );
    client.stdin.write('apps/nextjs\n');

    await expect(client.stderr).toOutput(
      'Auto-detected Project Settings for Next.js'
    );
    await expect(client.stderr).toOutput('Want to modify these settings?');
    client.stdin.write('\n');

    await expect(client.stderr).toOutput(
      'Do you want to change additional project settings?'
    );
    client.stdin.write('\n');

    await expect(client.stderr).toOutput(
      `Linked to ${user.username}/awesome-app (created .vercel and added it to .gitignore)`
    );

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "link"').toEqual(0);
  });

  it('should write vercel.json for inferred multi-service layouts', async () => {
    useUser();
    const cwd = setupTmpDir();
    useTeams('team_dummy');
    useUnknownProject();

    await writeJSON(join(cwd, 'package.json'), {
      dependencies: {
        next: 'latest',
      },
    });
    await mkdirp(join(cwd, 'services/api'));
    await writeFile(join(cwd, 'services/api/requirements.txt'), 'fastapi\n');
    await writeFile(
      join(cwd, 'services/api/index.py'),
      'from fastapi import FastAPI\napp = FastAPI()\n'
    );

    client.cwd = cwd;
    const exitCodePromise = link(client);

    await expect(client.stderr).toOutput('Set up');
    client.stdin.write('y\n');

    await expect(client.stderr).toOutput(
      'Which scope should contain your project?'
    );
    client.stdin.write('\n');

    await expect(client.stderr).toOutput('Link to existing project?');
    client.stdin.write('n\n');

    await expect(client.stderr).toOutput('What’s your project’s name?');
    client.stdin.write('multi-service-app\n');

    await expect(client.stderr).toOutput(
      'Multiple services were detected. How would you like to set up this project?'
    );
    expect(client.stderr.getFullOutput()).toContain(
      'Set up project with all detected services: "frontend" + "api"'
    );
    expect(client.stderr.getFullOutput()).toContain(
      'Set up project with "frontend"'
    );
    expect(client.stderr.getFullOutput()).toContain(
      'Set up project with "api"'
    );
    client.stdin.write('\n');

    await expect(client.stderr).toOutput(
      'Do you want to change additional project settings?'
    );
    client.stdin.write('\n');

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "link"').toEqual(0);

    expect(await readJSON(join(cwd, 'vercel.json'))).toMatchObject({
      experimentalServices: {
        frontend: {
          framework: 'nextjs',
          routePrefix: '/',
        },
        api: {
          entrypoint: 'services/api',
          routePrefix: '/_/api',
        },
      },
    });

    const projectJson = await readJSON(join(cwd, '.vercel/project.json'));
    const project = await getProjectByNameOrId(client, projectJson.projectId);
    if (project instanceof ProjectNotFound) {
      throw project;
    }
    expect(project.framework).toEqual('services');
  });

  it('should continue with framework detection when root inferred services are declined', async () => {
    useUser();
    const cwd = setupTmpDir();
    useTeams('team_dummy');
    useUnknownProject();

    await writeJSON(join(cwd, 'package.json'), {
      dependencies: {
        next: 'latest',
      },
    });
    await mkdirp(join(cwd, 'services/api'));
    await writeFile(join(cwd, 'services/api/requirements.txt'), 'fastapi\n');
    await writeFile(
      join(cwd, 'services/api/index.py'),
      'from fastapi import FastAPI\napp = FastAPI()\n'
    );

    client.cwd = cwd;
    const exitCodePromise = link(client);

    await expect(client.stderr).toOutput('Set up');
    client.stdin.write('y\n');

    await expect(client.stderr).toOutput(
      'Which scope should contain your project?'
    );
    client.stdin.write('\n');

    await expect(client.stderr).toOutput('Link to existing project?');
    client.stdin.write('n\n');

    await expect(client.stderr).toOutput('What’s your project’s name?');
    client.stdin.write('declined-multi-service-app\n');

    await expect(client.stderr).toOutput(
      'Multiple services were detected. How would you like to set up this project?'
    );
    expect(client.stderr.getFullOutput()).toContain(
      'Set up project with "frontend"'
    );
    client.stdin.write('\x1B[B\n');

    await expect(client.stderr).toOutput(
      'Auto-detected Project Settings for Next.js'
    );
    await expect(client.stderr).toOutput('Want to modify these settings?');
    client.stdin.write('\n');

    await expect(client.stderr).toOutput(
      'Do you want to change additional project settings?'
    );
    client.stdin.write('\n');

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "link"').toEqual(0);

    expect(await pathExists(join(cwd, 'vercel.json'))).toBe(false);
    expect(client.stderr.getFullOutput()).not.toContain(
      'In which directory is your code located?'
    );

    const projectJson = await readJSON(join(cwd, '.vercel/project.json'));
    const project = await getProjectByNameOrId(client, projectJson.projectId);
    if (project instanceof ProjectNotFound) {
      throw project;
    }
    expect(project.framework).toEqual('nextjs');
  });

  it('should continue with the selected nested web service when single-app is chosen', async () => {
    useUser();
    const cwd = setupTmpDir();
    useTeams('team_dummy');
    useUnknownProject();

    await writeJSON(join(cwd, 'package.json'), {
      dependencies: {
        next: 'latest',
      },
    });
    await mkdirp(join(cwd, 'services/api'));
    await writeFile(join(cwd, 'services/api/requirements.txt'), 'fastapi\n');
    await writeFile(
      join(cwd, 'services/api/index.py'),
      'from fastapi import FastAPI\napp = FastAPI()\n'
    );

    client.cwd = cwd;
    const exitCodePromise = link(client);

    await expect(client.stderr).toOutput('Set up');
    client.stdin.write('y\n');

    await expect(client.stderr).toOutput(
      'Which scope should contain your project?'
    );
    client.stdin.write('\n');

    await expect(client.stderr).toOutput('Link to existing project?');
    client.stdin.write('n\n');

    await expect(client.stderr).toOutput('What’s your project’s name?');
    client.stdin.write('single-fastapi-app\n');

    await expect(client.stderr).toOutput(
      'Multiple services were detected. How would you like to set up this project?'
    );
    expect(client.stderr.getFullOutput()).toContain(
      'Set up project with "api"'
    );
    client.stdin.write('\x1B[B\x1B[B\n');

    await expect(client.stderr).toOutput(
      'Auto-detected Project Settings for FastAPI'
    );
    await expect(client.stderr).toOutput('Want to modify these settings?');
    client.stdin.write('\n');

    await expect(client.stderr).toOutput(
      'Do you want to change additional project settings?'
    );
    client.stdin.write('\n');

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "link"').toEqual(0);

    expect(await pathExists(join(cwd, 'vercel.json'))).toBe(false);
    expect(client.stderr.getFullOutput()).not.toContain(
      'In which directory is your code located?'
    );

    const projectJson = await readJSON(join(cwd, '.vercel/project.json'));
    const project = await getProjectByNameOrId(client, projectJson.projectId);
    if (project instanceof ProjectNotFound) {
      throw project;
    }
    expect(project.framework).toEqual('fastapi');
    expect(project.rootDirectory).toEqual('services/api');
  });

  it('should allow choosing a different project directory before deploying detected services', async () => {
    useUser();
    const cwd = setupTmpDir();
    useTeams('team_dummy');
    useUnknownProject();

    await writeJSON(join(cwd, 'package.json'), {
      dependencies: {
        next: 'latest',
      },
    });
    await mkdirp(join(cwd, 'services/root-api'));
    await writeFile(
      join(cwd, 'services/root-api/requirements.txt'),
      'fastapi\n'
    );
    await writeFile(
      join(cwd, 'services/root-api/index.py'),
      'from fastapi import FastAPI\napp = FastAPI()\n'
    );

    await mkdirp(join(cwd, 'apps/web/services/api'));
    await writeJSON(join(cwd, 'apps/web/package.json'), {
      dependencies: {
        next: 'latest',
      },
    });
    await writeFile(
      join(cwd, 'apps/web/services/api/requirements.txt'),
      'fastapi\n'
    );
    await writeFile(
      join(cwd, 'apps/web/services/api/index.py'),
      'from fastapi import FastAPI\napp = FastAPI()\n'
    );

    client.cwd = cwd;
    const exitCodePromise = link(client);

    await expect(client.stderr).toOutput('Set up');
    client.stdin.write('y\n');

    await expect(client.stderr).toOutput(
      'Which scope should contain your project?'
    );
    client.stdin.write('\n');

    await expect(client.stderr).toOutput('Link to existing project?');
    client.stdin.write('n\n');

    await expect(client.stderr).toOutput('What’s your project’s name?');
    client.stdin.write('selected-directory-multi-service-app\n');

    await expect(client.stderr).toOutput(
      'Multiple services were detected. How would you like to set up this project?'
    );
    expect(client.stderr.getFullOutput()).toContain(
      'Choose a different root directory'
    );
    client.stdin.write('\x1B[B\x1B[B\x1B[B\n');

    await expect(client.stderr).toOutput(
      'In which directory is your code located? ./'
    );
    client.stdin.write('apps/web\n');

    await expect(client.stderr).toOutput(
      'Multiple services were detected. How would you like to set up this project?'
    );
    client.stdin.write('\n');

    await expect(client.stderr).toOutput(
      'Do you want to change additional project settings?'
    );
    client.stdin.write('\n');

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "link"').toEqual(0);

    expect(await readJSON(join(cwd, 'apps/web/vercel.json'))).toMatchObject({
      experimentalServices: {
        frontend: {
          framework: 'nextjs',
          routePrefix: '/',
        },
        api: {
          entrypoint: 'services/api',
          routePrefix: '/_/api',
        },
      },
    });
    expect(await pathExists(join(cwd, 'vercel.json'))).toBe(false);

    const projectJson = await readJSON(join(cwd, '.vercel/project.json'));
    const project = await getProjectByNameOrId(client, projectJson.projectId);
    if (project instanceof ProjectNotFound) {
      throw project;
    }
    expect(project.framework).toEqual('services');
    expect(project.rootDirectory).toEqual('apps/web');
  });

  it('should write vercel.json for inferred multi-service layouts in the selected root directory', async () => {
    useUser();
    const cwd = setupTmpDir();
    useTeams('team_dummy');
    useUnknownProject();

    await mkdirp(join(cwd, 'apps/web/services/api'));
    await writeJSON(join(cwd, 'apps/web/package.json'), {
      dependencies: {
        next: 'latest',
      },
    });
    await writeFile(
      join(cwd, 'apps/web/services/api/requirements.txt'),
      'fastapi\n'
    );
    await writeFile(
      join(cwd, 'apps/web/services/api/index.py'),
      'from fastapi import FastAPI\napp = FastAPI()\n'
    );

    client.cwd = cwd;
    const exitCodePromise = link(client);

    await expect(client.stderr).toOutput('Set up');
    client.stdin.write('y\n');

    await expect(client.stderr).toOutput(
      'Which scope should contain your project?'
    );
    client.stdin.write('\n');

    await expect(client.stderr).toOutput('Link to existing project?');
    client.stdin.write('n\n');

    await expect(client.stderr).toOutput('What’s your project’s name?');
    client.stdin.write('nested-multi-service-app\n');

    await expect(client.stderr).toOutput(
      'In which directory is your code located? ./'
    );
    client.stdin.write('apps/web\n');

    await expect(client.stderr).toOutput(
      'Multiple services were detected. How would you like to set up this project?'
    );
    client.stdin.write('\n');

    await expect(client.stderr).toOutput(
      'Do you want to change additional project settings?'
    );
    client.stdin.write('\n');

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "link"').toEqual(0);

    expect(await readJSON(join(cwd, 'apps/web/vercel.json'))).toMatchObject({
      experimentalServices: {
        frontend: {
          framework: 'nextjs',
          routePrefix: '/',
        },
        api: {
          entrypoint: 'services/api',
          routePrefix: '/_/api',
        },
      },
    });
    expect(await pathExists(join(cwd, 'vercel.json'))).toBe(false);

    const projectJson = await readJSON(join(cwd, '.vercel/project.json'));
    const project = await getProjectByNameOrId(client, projectJson.projectId);
    if (project instanceof ProjectNotFound) {
      throw project;
    }
    expect(project.framework).toEqual('services');
    expect(project.rootDirectory).toEqual('apps/web');
  });

  it('should continue link when selected root vercel.json is invalid', async () => {
    useUser();
    const cwd = setupTmpDir();
    useTeams('team_dummy');
    useUnknownProject();

    await mkdirp(join(cwd, 'apps/web'));
    await writeFile(join(cwd, 'apps/web/vercel.json'), '{\n');

    client.cwd = cwd;
    const exitCodePromise = link(client);

    await expect(client.stderr).toOutput('Set up');
    client.stdin.write('y\n');

    await expect(client.stderr).toOutput(
      'Which scope should contain your project?'
    );
    client.stdin.write('\n');

    await expect(client.stderr).toOutput('Link to existing project?');
    client.stdin.write('n\n');

    await expect(client.stderr).toOutput('What’s your project’s name?');
    client.stdin.write('invalid-selected-root-config-app\n');

    await expect(client.stderr).toOutput(
      'In which directory is your code located? ./'
    );
    client.stdin.write('apps/web\n');

    await expect(client.stderr).toOutput(
      'Do you want to change additional project settings?'
    );
    client.stdin.write('\n');

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "link"').toEqual(0);

    const projectJson = await readJSON(join(cwd, '.vercel/project.json'));
    const project = await getProjectByNameOrId(client, projectJson.projectId);
    if (project instanceof ProjectNotFound) {
      throw project;
    }
    expect(project.framework).toEqual('services');
    expect(project.rootDirectory).toEqual('apps/web');
  });

  it('should warn when inferred services are blocked by builds config', async () => {
    useUser();
    const cwd = setupTmpDir();
    useTeams('team_dummy');
    useUnknownProject();

    await writeJSON(join(cwd, 'package.json'), {
      dependencies: {
        next: 'latest',
      },
    });
    await writeJSON(join(cwd, 'vercel.json'), {
      builds: [{ src: 'package.json', use: '@vercel/next' }],
    });
    await mkdirp(join(cwd, 'services/api'));
    await writeFile(join(cwd, 'services/api/requirements.txt'), 'fastapi\n');
    await writeFile(
      join(cwd, 'services/api/index.py'),
      'from fastapi import FastAPI\napp = FastAPI()\n'
    );

    client.cwd = cwd;
    const exitCodePromise = link(client);

    await expect(client.stderr).toOutput('Set up');
    client.stdin.write('y\n');

    await expect(client.stderr).toOutput(
      'Which scope should contain your project?'
    );
    client.stdin.write('\n');

    await expect(client.stderr).toOutput('Link to existing project?');
    client.stdin.write('n\n');

    await expect(client.stderr).toOutput('What’s your project’s name?');
    client.stdin.write('services-with-builds\n');

    await expect(client.stderr).toOutput(
      'Multiple services were detected, but your existing project config uses `builds`. To deploy multiple services in one project, see Services (https://vercel.com/docs/services).'
    );

    await expect(client.stderr).toOutput(
      'In which directory is your code located? ./'
    );
    client.stdin.write('\n');

    await expect(client.stderr).toOutput(
      'Do you want to change additional project settings?'
    );
    client.stdin.write('\n');

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "link"').toEqual(0);
    expect(client.stderr.getFullOutput()).not.toContain('Detected services:');
    expect(client.stderr.getFullOutput()).not.toContain(
      'Services are configured via vercel.json.'
    );
    expect(client.stderr.getFullOutput()).not.toContain(
      'Multiple services were detected. How would you like to set up this project?'
    );
  });

  it('should allow overwriting existing link', async () => {
    const cwd = setupTmpDir();
    const user = useUser();
    useTeams('team_dummy');
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
    const exitCodeLink1 = await link(client);
    expect(exitCodeLink1, 'exit code for "link"').toEqual(0);

    let projectJson = await readJSON(join(cwd, '.vercel/project.json'));
    expect(projectJson.orgId).toEqual(user.id);
    expect(projectJson.projectId).toEqual(proj1.id);
    expect(projectJson.projectName).toEqual(proj1.name);

    client.setArgv('--project', proj2.name!, '--yes');
    const exitCodeLink2 = await link(client);
    expect(exitCodeLink2, 'exit code for "link"').toEqual(0);

    projectJson = await readJSON(join(cwd, '.vercel/project.json'));
    expect(projectJson.orgId).toEqual(user.id);
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
      const user = useUser();
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

      useTeams('team_dummy');
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

      await expect(client.stderr).toOutput('Set up');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        'Which scope should contain your project?'
      );
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('Found project');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        `Linked to ${user.username}/${project.name} (created .vercel`
      );

      await expect(client.stderr).toOutput(
        'Would you like to pull environment variables now?'
      );
      client.stdin.write('n\n');

      const exitCode = await exitCodePromise;
      selectSpy.mockRestore();

      expect(exitCode).toEqual(0);
      expect(sawRepoProjectSelector).toBe(false);
      expect(client.stderr.getFullOutput()).not.toContain(
        'Please select a Project:'
      );
    });
  });

  describe('environment variable pull prompt', () => {
    it('should prompt to pull environment variables after successful linking', async () => {
      const user = useUser();
      const cwd = setupTmpDir();
      useTeams('team_dummy');
      const { project } = useProject({
        ...defaultProject,
        id: basename(cwd),
        name: basename(cwd),
      });
      useUnknownProject();

      client.cwd = cwd;
      client.setArgv('--project', project.name!);
      const exitCodePromise = link(client);

      await expect(client.stderr).toOutput('Set up');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        'Which scope should contain your project?'
      );
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('Link to it?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        `Linked to ${user.username}/${project.name} (created .vercel and added it to .gitignore)`
      );

      await expect(client.stderr).toOutput(
        'Would you like to pull environment variables now?'
      );
      client.stdin.write('y\n');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      expect(mockPull).toHaveBeenCalledWith(
        expect.objectContaining({ cwd }),
        [],
        'vercel-cli:link'
      );
    });

    it('should not call env pull when user declines the prompt', async () => {
      const user = useUser();
      const cwd = setupTmpDir();
      useTeams('team_dummy');
      const { project } = useProject({
        ...defaultProject,
        id: basename(cwd),
        name: basename(cwd),
      });
      useUnknownProject();

      client.cwd = cwd;
      client.setArgv('--project', project.name!);
      const exitCodePromise = link(client);

      await expect(client.stderr).toOutput('Set up');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        'Which scope should contain your project?'
      );
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('Link to it?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        `Linked to ${user.username}/${project.name} (created .vercel and added it to .gitignore)`
      );

      await expect(client.stderr).toOutput(
        'Would you like to pull environment variables now?'
      );
      client.stdin.write('n\n');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      // Verify env pull was NOT called
      expect(mockPull).not.toHaveBeenCalled();
    });

    it('should handle env pull failure gracefully', async () => {
      const user = useUser();
      const cwd = setupTmpDir();
      useTeams('team_dummy');
      const { project } = useProject({
        ...defaultProject,
        id: basename(cwd),
        name: basename(cwd),
      });
      useUnknownProject();

      // Mock env pull to fail
      mockPull.mockResolvedValue(1);

      client.cwd = cwd;
      client.setArgv('--project', project.name!);
      const exitCodePromise = link(client);

      await expect(client.stderr).toOutput('Set up');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        'Which scope should contain your project?'
      );
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('Link to it?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        `Linked to ${user.username}/${project.name} (created .vercel and added it to .gitignore)`
      );

      await expect(client.stderr).toOutput(
        'Would you like to pull environment variables now?'
      );
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        'Failed to pull environment variables. You can run `vc env pull` manually.'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0); // Link should still succeed even if env pull fails

      expect(mockPull).toHaveBeenCalledWith(
        expect.objectContaining({ cwd }),
        [],
        'vercel-cli:link'
      );
    });

    it('should handle env pull command throwing an error', async () => {
      const user = useUser();
      const cwd = setupTmpDir();
      useTeams('team_dummy');
      const { project } = useProject({
        ...defaultProject,
        id: basename(cwd),
        name: basename(cwd),
      });
      useUnknownProject();

      // Mock env pull to throw an error
      mockPull.mockRejectedValue(new Error('Network error'));

      client.cwd = cwd;
      client.setArgv('--project', project.name!);
      const exitCodePromise = link(client);

      await expect(client.stderr).toOutput('Set up');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        'Which scope should contain your project?'
      );
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('Link to it?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        `Linked to ${user.username}/${project.name} (created .vercel and added it to .gitignore)`
      );

      await expect(client.stderr).toOutput(
        'Would you like to pull environment variables now?'
      );
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        'Failed to pull environment variables. You can run `vc env pull` manually.'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0); // Link should still succeed even if env pull throws

      expect(mockPull).toHaveBeenCalledWith(
        expect.objectContaining({ cwd }),
        [],
        'vercel-cli:link'
      );
    });

    it('should pass empty args to env pull when link command does not use --yes', async () => {
      const user = useUser();
      const cwd = setupTmpDir();
      useTeams('team_dummy');
      const { project } = useProject({
        ...defaultProject,
        id: basename(cwd),
        name: basename(cwd),
      });
      useUnknownProject();

      client.cwd = cwd;
      client.setArgv('--project', project.name!);
      const exitCodePromise = link(client);

      await expect(client.stderr).toOutput('Set up');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        'Which scope should contain your project?'
      );
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('Link to it?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        `Linked to ${user.username}/${project.name} (created .vercel and added it to .gitignore)`
      );

      await expect(client.stderr).toOutput(
        'Would you like to pull environment variables now?'
      );
      client.stdin.write('y\n');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      // Verify env pull was called with empty args since link didn't use --yes
      expect(mockPull).toHaveBeenCalledWith(
        expect.objectContaining({ cwd }),
        [],
        'vercel-cli:link'
      );
    });

    it('should restore client.cwd after env pull completes', async () => {
      const user = useUser();
      const cwd = setupTmpDir();
      useTeams('team_dummy');
      const { project } = useProject({
        ...defaultProject,
        id: basename(cwd),
        name: basename(cwd),
      });
      useUnknownProject();

      client.cwd = cwd;
      const originalCwd = client.cwd;
      client.setArgv('--project', project.name!);
      const exitCodePromise = link(client);

      await expect(client.stderr).toOutput('Set up');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        'Which scope should contain your project?'
      );
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('Link to it?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        `Linked to ${user.username}/${project.name} (created .vercel and added it to .gitignore)`
      );

      await expect(client.stderr).toOutput(
        'Would you like to pull environment variables now?'
      );
      client.stdin.write('y\n');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      // Verify client.cwd is restored to original value after env pull
      expect(client.cwd).toEqual(originalCwd);
    });

    it('should restore client.cwd even when env pull throws exception', async () => {
      const user = useUser();
      const cwd = setupTmpDir();
      useTeams('team_dummy');
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

      await expect(client.stderr).toOutput('Set up');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        'Which scope should contain your project?'
      );
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('Link to it?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        `Linked to ${user.username}/${project.name} (created .vercel and added it to .gitignore)`
      );

      await expect(client.stderr).toOutput(
        'Would you like to pull environment variables now?'
      );
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        'Failed to pull environment variables. You can run `vc env pull` manually.'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      // Verify client.cwd is restored even when env pull throws
      expect(client.cwd).toEqual(originalCwd);
    });
  });

  describe('input validation', () => {
    describe('--project flag', () => {
      it('rejects control characters in agent mode with structured JSON', async () => {
        client.setArgv('link', '--project', 'my-project\x00evil', '--yes');
        (client as { nonInteractive: boolean }).nonInteractive = true;

        const exitCode = await link(client);
        expect(exitCode).toBe(3); // EXIT_CODE.VALIDATION

        const output = client.stdout.getFullOutput();
        const result = JSON.parse(output);
        expect(result.status).toBe('error');
        expect(result.reason).toBe('invalid_arguments');
        expect(result.message).toContain('Control characters detected');
        expect(result.message).toContain('project');
        expect(result.next).toBeDefined();
        expect(result.next.length).toBeGreaterThan(0);
        expect(result.next[0].command).toContain('link --project <name>');

        (client as { nonInteractive: boolean }).nonInteractive = false;
      });

      it('rejects resource ID with query params in agent mode', async () => {
        client.setArgv('link', '--project', 'proj_123?fields=name', '--yes');
        (client as { nonInteractive: boolean }).nonInteractive = true;

        const exitCode = await link(client);
        expect(exitCode).toBe(3);

        const output = client.stdout.getFullOutput();
        const result = JSON.parse(output);
        expect(result.status).toBe('error');
        expect(result.reason).toBe('invalid_arguments');
        expect(result.message).toContain('resource IDs must not contain');

        (client as { nonInteractive: boolean }).nonInteractive = false;
      });

      it('rejects control characters in interactive mode with error output', async () => {
        client.setArgv('link', '--project', 'my-project\x00evil', '--yes');
        (client as { nonInteractive: boolean }).nonInteractive = false;

        const exitCode = await link(client);
        expect(exitCode).toBe(3);

        // In interactive mode, error goes to stderr, not structured JSON to stdout
        const stdoutOutput = client.stdout.getFullOutput();
        expect(stdoutOutput.trim()).toBe('');
      });

      it('accepts valid project names', async () => {
        useUser();
        const cwd = setupTmpDir();
        useTeams('team_dummy');
        useProject({
          ...defaultProject,
          id: 'valid-project',
          name: 'valid-project',
        });
        useUnknownProject();

        client.cwd = cwd;
        client.setArgv('link', '--project', 'valid-project', '--yes');

        const exitCodePromise = link(client);

        await expect(client.stderr).toOutput('Linked to');

        const exitCode = await exitCodePromise;
        expect(exitCode).toBe(0);
      });
    });

    describe('--team flag', () => {
      it('rejects control characters in agent mode with structured JSON', async () => {
        client.setArgv('link', '--team', 'team\x1bevil', '--yes');
        (client as { nonInteractive: boolean }).nonInteractive = true;

        const exitCode = await link(client);
        expect(exitCode).toBe(3);

        const output = client.stdout.getFullOutput();
        const result = JSON.parse(output);
        expect(result.status).toBe('error');
        expect(result.reason).toBe('invalid_arguments');
        expect(result.message).toContain('Control characters detected');
        expect(result.message).toContain('team');
        expect(result.next[0].command).toContain('link --team <slug>');

        (client as { nonInteractive: boolean }).nonInteractive = false;
      });

      it('rejects resource ID with fragment in agent mode', async () => {
        client.setArgv('link', '--team', 'team_abc#fragment', '--yes');
        (client as { nonInteractive: boolean }).nonInteractive = true;

        const exitCode = await link(client);
        expect(exitCode).toBe(3);

        const output = client.stdout.getFullOutput();
        const result = JSON.parse(output);
        expect(result.status).toBe('error');
        expect(result.reason).toBe('invalid_arguments');
        expect(result.message).toContain('resource IDs must not contain');

        (client as { nonInteractive: boolean }).nonInteractive = false;
      });

      it('rejects control characters in interactive mode', async () => {
        client.setArgv('link', '--team', 'team\x00evil', '--yes');
        (client as { nonInteractive: boolean }).nonInteractive = false;

        const exitCode = await link(client);
        expect(exitCode).toBe(3);
      });
    });
  });
});
