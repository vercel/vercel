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
import { useTeams } from '../../../mocks/team';
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
      await expect(exitCodePromise).resolves.toEqual(0);

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
      client.stdin.write('y\n');

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
        orgId: user.id,
        projects: [
          {
            directory: '.',
            id: project.id,
            name: project.name,
          },
        ],
        remoteName: 'upstream',
      });
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
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(`Fetching Projects for ${repoUrl}`);
      await expect(client.stderr).toOutput(`No Projects are linked`);
      await expect(client.stderr).toOutput(
        `Detected 1 new Project that may be created.`
      );
      await expect(client.stderr).toOutput(`Which Projects should be created?`);
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        `Linked to 1 Project under ${user.username} (created .vercel and added it to .gitignore)`
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      const repoJson = await readJSON(join(cwd, '.vercel/repo.json'));
      expect(repoJson.orgId).toEqual(user.id);
      expect(repoJson.remoteName).toEqual('upstream');
      expect(repoJson.projects).toHaveLength(1);
      expect(repoJson.projects[0].directory).toEqual('.');
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
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(`Fetching Projects for ${repoUrl}`);
      await expect(client.stderr).toOutput(`No Projects are linked`);
      await expect(client.stderr).toOutput(
        `Detected 2 new Projects that may be created.`
      );
      await expect(client.stderr).toOutput(`Which Projects should be created?`);
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        `Linked to 2 Projects under ${user.username} (created .vercel and added it to .gitignore)`
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      const repoJson = await readJSON(join(cwd, '.vercel/repo.json'));
      expect(repoJson.orgId).toEqual(user.id);
      expect(repoJson.remoteName).toEqual('origin');
      expect(repoJson.projects).toHaveLength(2);

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
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(`Fetching Projects for ${repoUrl}`);
      await expect(client.stderr).toOutput(`No Projects are linked`);
      await expect(client.stderr).toOutput(
        `Detected 1 new Project that may be created.`
      );
      await expect(client.stderr).toOutput(`Which Projects should be created?`);
      client.stdin.write('y\n');

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
    client.stdin.write('y\n');

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
    client.stdin.write('y\n');

    await expect(client.stderr).toOutput('Link to existing project?');
    client.stdin.write('n\n');

    await expect(client.stderr).toOutput('What’s your project’s name?');
    client.stdin.write('awesome-app\n');

    await expect(client.stderr).toOutput(
      'In which directory is your code located? ./'
    );
    client.stdin.write('apps/nextjs\n');

    await expect(client.stderr).toOutput(
      'Auto-detected Project Settings (Next.js)'
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

    await expect(client.stderr).toOutput(
      'Would you like to pull environment variables now?'
    );
    client.stdin.write('n\n');

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "link"').toEqual(0);
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
      client.stdin.write('y\n');

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
      client.stdin.write('y\n');

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
      client.stdin.write('y\n');

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
      client.stdin.write('y\n');

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
      client.stdin.write('y\n');

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
      client.stdin.write('y\n');

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
      client.stdin.write('y\n');

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
});
