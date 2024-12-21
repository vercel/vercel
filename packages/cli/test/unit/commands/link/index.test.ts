import { EOL } from 'node:os';
import { describe, it, expect } from 'vitest';
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

describe('link', () => {
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

    it('should create new Project with Git connection linked', async () => {
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
      expect(project.framework).toEqual('nextjs');
      expect(project.link?.repo).toEqual('user/repo');
      expect(project.link?.type).toEqual('github');
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

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "link"').toEqual(0);

    const projectJson = await readJSON(join(cwd, '.vercel/project.json'));
    expect(projectJson.orgId).toEqual(user.id);
    expect(projectJson.projectId).toEqual(project.id);
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
      `Linked to ${user.username}/awesome-app (created .vercel and added it to .gitignore)`
    );

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

    client.setArgv('--project', proj2.name!, '--yes');
    const exitCodeLink2 = await link(client);
    expect(exitCodeLink2, 'exit code for "link"').toEqual(0);

    projectJson = await readJSON(join(cwd, '.vercel/project.json'));
    expect(projectJson.orgId).toEqual(user.id);
    expect(projectJson.projectId).toEqual(proj2.id);
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
});
