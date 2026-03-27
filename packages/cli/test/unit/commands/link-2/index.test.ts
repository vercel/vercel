/**
 * link-2 command tests.
 * Mocks Vercel APIs (repo projects, selectOrg, createProject, connectGitProvider, env pull).
 * Uses interactive vs non-interactive wording; --json only affects final output format, not behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { realpathSync } from 'fs';
import { mkdirp, readJSON, writeFile, pathExists } from 'fs-extra';
import { cpSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import link2 from '../../../../src/commands/link-2';
import pull from '../../../../src/commands/env/pull';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { useUnknownProject } from '../../../mocks/project';
import type { Project } from '@vercel-internals/types';

vi.mock('../../../../src/commands/env/pull');
const mockPull = vi.mocked(pull);

const FIXTURES_DIR = join(__dirname, 'fixtures');

function copyFixtureToTmp(fixtureName: string): string {
  const tmpDir = mkdtempSync(join(tmpdir(), 'link-2-cmd-'));
  cpSync(join(FIXTURES_DIR, fixtureName), tmpDir, { recursive: true });
  return tmpDir;
}

function setupGitRepo(
  cwd: string,
  originUrl = 'https://github.com/org/repo.git'
) {
  return mkdirp(join(cwd, '.git')).then(() =>
    writeFile(
      join(cwd, '.git/config'),
      `[remote "origin"]\n\turl = ${originUrl}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`
    )
  );
}

/**
 * Send Enter to accept the default for a confirm prompt.
 * Use when the prompt default is "yes" and we want to assert that default (rather than sending "y" explicitly).
 */
function acceptConfirmDefault() {
  client.stdin.write('\n');
}

/** Send "n" + Enter to decline a confirm prompt. */
function declineConfirm() {
  client.stdin.write('n\n');
}

/** Mock /v9/projects for repo (repoUrl) and for potentialProjects (limit=100). */
function mockV9Projects(
  repoProjects: Project[],
  allProjectsForPotential: Project[] = []
) {
  client.scenario.get('/v9/projects', (req: any, res: any) => {
    const repoUrl = req.query?.repoUrl;
    if (typeof repoUrl === 'string' && repoUrl.length > 0) {
      return res.json({
        projects: repoProjects,
        pagination: { count: repoProjects.length, next: null, prev: null },
      });
    }
    return res.json({
      projects: allProjectsForPotential.length
        ? allProjectsForPotential
        : repoProjects,
      pagination: {
        count: allProjectsForPotential.length || repoProjects.length,
        next: null,
        prev: null,
      },
    });
  });
}

describe('link-2', () => {
  const tmpDirs: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    mockPull.mockResolvedValue(0);
  });

  afterEach(() => {
    for (const dir of tmpDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    tmpDirs.length = 0;
  });

  describe('--help', () => {
    it('prints help and returns 2', async () => {
      client.setArgv('link-2', '--help');
      const code = await link2(client);
      expect(code).toBe(2);
      await expect(client.stderr).toOutput('link-2');
    });
  });

  describe('--json (output format only)', () => {
    it('non-interactive: links then outputs JSON with baseline and linked projects', async () => {
      useUser();
      const teamId = 'team_abc';
      useTeams(teamId);
      useUnknownProject();

      const tmpDir = copyFixtureToTmp('monorepo-linked');
      tmpDirs.push(tmpDir);
      await setupGitRepo(tmpDir);

      const repoProjects: Project[] = [
        {
          id: 'proj_web_123',
          name: 'web',
          accountId: teamId,
          rootDirectory: 'apps/web',
          link: {
            type: 'github',
            repo: 'org/repo',
            repoId: 123,
            org: teamId,
            gitCredentialId: '',
            sourceless: true,
            createdAt: 0,
            updatedAt: 0,
          },
        } as Project,
      ];
      mockV9Projects(repoProjects, repoProjects);

      client.cwd = tmpDir;
      client.setArgv('link-2', '--yes', '--json');

      const code = await link2(client);
      expect(code).toBe(0);

      const out = client.stderr.getFullOutput();
      const jsonStart = out.indexOf('{');
      const json = JSON.parse(out.slice(jsonStart));
      const resolvedTmp = realpathSync(tmpDir);
      expect(json.cwd).toBe(resolvedTmp);
      expect(json.rootPath).toBe(resolvedTmp);
      expect(json.repo).not.toBeNull();
      expect(Array.isArray(json.repo)).toBe(true);
      expect(json.repo.length).toBe(1);
      expect(json.repo[0].name).toBe('web');
      expect(Array.isArray(json.potentialProjects)).toBe(true);
      expect(Array.isArray(json.linked)).toBe(true);
      expect(json.linked.length).toBe(1);
      expect(json.linked[0].name).toBe('web');
    });

    it('non-interactive: no repo root links directory-only and outputs JSON with linked: true', async () => {
      useUser();
      useTeams('team_abc');
      useUnknownProject();

      const tmpDir = mkdtempSync(join(tmpdir(), 'link-2-no-repo-'));
      tmpDirs.push(tmpDir);
      await writeFile(
        join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'my-app' })
      );

      client.cwd = tmpDir;
      client.setArgv('link-2', '--yes', '--json');

      const code = await link2(client);
      expect(code).toBe(0);

      const out = client.stderr.getFullOutput();
      const jsonStart = out.indexOf('{');
      const json = JSON.parse(out.slice(jsonStart));
      expect(json.rootPath).toBeNull();
      expect(json.repo).toBeNull();
      expect(json.linked).toBe(true);
    });
  });

  describe('when no repo root is found', () => {
    it('non-interactive: runs directory-only link and writes .vercel', async () => {
      useUser();
      useTeams('team_abc');
      useUnknownProject();

      const tmpDir = mkdtempSync(join(tmpdir(), 'link-2-no-repo-'));
      tmpDirs.push(tmpDir);
      await writeFile(
        join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'my-app' })
      );

      client.cwd = tmpDir;
      client.setArgv('link-2', '--yes');

      const code = await link2(client);
      expect(code).toBe(0);
      expect(await pathExists(join(tmpDir, '.vercel', 'project.json'))).toBe(
        true
      );
      await expect(client.stderr).toOutput('Linked');
    });

    it('requires confirmation when not a TTY', async () => {
      useUser();
      useTeams('team_abc');
      useUnknownProject();

      const tmpDir = mkdtempSync(join(tmpdir(), 'link-2-no-repo-'));
      tmpDirs.push(tmpDir);
      await writeFile(
        join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'my-app' })
      );

      client.cwd = tmpDir;
      client.setArgv('link-2');
      (client.stdin as { isTTY?: boolean }).isTTY = false;

      const code = await link2(client);
      expect(code).toBe(1);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('requires confirmation');
      expect(stderr).toContain('--yes');

      (client.stdin as { isTTY?: boolean }).isTTY = true;
    });

    it('interactive: runs directory-only link when no repo (prompts Set up, scope, then links)', async () => {
      useUser();
      useTeams('team_abc');
      useUnknownProject();

      const tmpDir = mkdtempSync(join(tmpdir(), 'link-2-no-repo-'));
      tmpDirs.push(tmpDir);
      await writeFile(
        join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'my-app' })
      );

      client.cwd = tmpDir;
      client.setArgv('link-2');

      const exitCodePromise = link2(client);

      await expect(client.stderr).toOutput('Set up');
      acceptConfirmDefault();

      await expect(client.stderr).toOutput('Which scope');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('Link to existing project');
      declineConfirm();

      await expect(client.stderr).toOutput('name?');
      client.stdin.write('my-app\n');

      await expect(client.stderr).toOutput('directory');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('modify these settings');
      declineConfirm();

      await expect(client.stderr).toOutput('additional project settings');
      declineConfirm();

      await expect(client.stderr).toOutput('Linked');
      declineConfirm();

      const code = await exitCodePromise;
      expect(code).toBe(0);
      expect(await pathExists(join(tmpDir, '.vercel', 'project.json'))).toBe(
        true
      );
    });
  });

  describe('non-interactive', () => {
    it('at repo root with existing repo projects: writes repo.json and project.json, links all', async () => {
      useUser();
      const teamId = 'team_abc';
      useTeams(teamId);
      useUnknownProject();

      const tmpDir = copyFixtureToTmp('monorepo-linked');
      tmpDirs.push(tmpDir);
      await setupGitRepo(tmpDir);

      const repoProjects: Project[] = [
        {
          id: 'proj_web_123',
          name: 'web',
          accountId: teamId,
          rootDirectory: 'apps/web',
          link: {
            type: 'github',
            repo: 'org/repo',
            repoId: 1,
            org: teamId,
            gitCredentialId: '',
            sourceless: true,
            createdAt: 0,
            updatedAt: 0,
          },
        } as Project,
      ];
      mockV9Projects(repoProjects);

      client.cwd = tmpDir;
      client.setArgv('link-2', '--yes');

      const code = await link2(client);
      expect(code).toBe(0);

      const repoPath = join(tmpDir, '.vercel', 'repo.json');
      expect(await pathExists(repoPath)).toBe(true);
      const repoJson = await readJSON(repoPath);
      expect(repoJson.projects).toHaveLength(1);
      expect(repoJson.projects[0].name).toBe('web');
      expect(repoJson.projects[0].directory).toBe('apps/web');
      expect(repoJson.projects[0].workPath).toBe('apps/web');

      const projectJsonPath = join(
        tmpDir,
        'apps',
        'web',
        '.vercel',
        'project.json'
      );
      expect(await pathExists(projectJsonPath)).toBe(true);
      const projectJson = await readJSON(projectJsonPath);
      expect(projectJson.projectId).toBe('proj_web_123');
      expect(projectJson.orgId).toBe(teamId);

      await expect(client.stderr).toOutput('Linked');
      await expect(client.stderr).toOutput('.vercel updated');
    });

    it('at repo root with zero repo projects: writes nothing, logs "No project to link"', async () => {
      useUser();
      useTeams('team_abc');
      useUnknownProject();

      const tmpDir = copyFixtureToTmp('monorepo-linked');
      tmpDirs.push(tmpDir);
      await setupGitRepo(tmpDir);
      mockV9Projects([]);

      client.cwd = tmpDir;
      client.setArgv('link-2', '--yes');

      const code = await link2(client);
      expect(code).toBe(0);
      await expect(client.stderr).toOutput('No project to link');
    });

    it('at repo root with two repo projects (link_many): writes repo.json and two project.json', async () => {
      useUser();
      const teamId = 'team_abc';
      useTeams(teamId);
      useUnknownProject();

      const tmpDir = copyFixtureToTmp('monorepo-linked');
      tmpDirs.push(tmpDir);
      await setupGitRepo(tmpDir);

      const repoProjects: Project[] = [
        {
          id: 'proj_web_123',
          name: 'web',
          accountId: teamId,
          rootDirectory: 'apps/web',
          link: {
            type: 'github',
            repo: 'org/repo',
            repoId: 1,
            org: teamId,
            gitCredentialId: '',
            sourceless: true,
            createdAt: 0,
            updatedAt: 0,
          },
        } as Project,
        {
          id: 'proj_api_456',
          name: 'api',
          accountId: teamId,
          rootDirectory: 'apps/api',
          link: {
            type: 'github',
            repo: 'org/repo',
            repoId: 1,
            org: teamId,
            gitCredentialId: '',
            sourceless: true,
            createdAt: 0,
            updatedAt: 0,
          },
        } as Project,
      ];
      mockV9Projects(repoProjects);

      client.cwd = tmpDir;
      client.setArgv('link-2', '--yes');

      const code = await link2(client);
      expect(code).toBe(0);

      const repoJson = await readJSON(join(tmpDir, '.vercel', 'repo.json'));
      expect(repoJson.projects).toHaveLength(2);
      expect(
        repoJson.projects.map((p: { name: string }) => p.name).sort()
      ).toEqual(['api', 'web']);
      expect(
        await pathExists(join(tmpDir, 'apps', 'web', '.vercel', 'project.json'))
      ).toBe(true);
      expect(
        await pathExists(join(tmpDir, 'apps', 'api', '.vercel', 'project.json'))
      ).toBe(true);
      await expect(client.stderr).toOutput('Linked 2 project(s)');
    });

    it('at repo root with single root project (link_one): writes one project at root', async () => {
      useUser();
      const teamId = 'team_abc';
      useTeams(teamId);
      useUnknownProject();

      const tmpDir = copyFixtureToTmp('monorepo-linked');
      tmpDirs.push(tmpDir);
      await setupGitRepo(tmpDir);

      const repoProjects: Project[] = [
        {
          id: 'proj_root_1',
          name: 'my-app',
          accountId: teamId,
          rootDirectory: '.',
          link: {
            type: 'github',
            repo: 'org/repo',
            repoId: 1,
            org: teamId,
            gitCredentialId: '',
            sourceless: true,
            createdAt: 0,
            updatedAt: 0,
          },
        } as Project,
      ];
      mockV9Projects(repoProjects);

      client.cwd = tmpDir;
      client.setArgv('link-2', '--yes');

      const code = await link2(client);
      expect(code).toBe(0);

      const repoJson = await readJSON(join(tmpDir, '.vercel', 'repo.json'));
      expect(repoJson.projects).toHaveLength(1);
      expect(repoJson.projects[0].name).toBe('my-app');
      expect(repoJson.projects[0].directory).toBe('.');
      expect(await pathExists(join(tmpDir, '.vercel', 'project.json'))).toBe(
        true
      );
      const projectJson = await readJSON(
        join(tmpDir, '.vercel', 'project.json')
      );
      expect(projectJson.projectId).toBe('proj_root_1');
    });

    it('from subfolder when repo has matching project (prompt_link_existing): links that project', async () => {
      useUser();
      const teamId = 'team_abc';
      useTeams(teamId);
      useUnknownProject();

      const tmpDir = copyFixtureToTmp('monorepo-linked');
      tmpDirs.push(tmpDir);
      await setupGitRepo(tmpDir);

      const repoProjects: Project[] = [
        {
          id: 'proj_web_123',
          name: 'web',
          accountId: teamId,
          rootDirectory: 'apps/web',
          link: {
            type: 'github',
            repo: 'org/repo',
            repoId: 1,
            org: teamId,
            gitCredentialId: '',
            sourceless: true,
            createdAt: 0,
            updatedAt: 0,
          },
        } as Project,
      ];
      mockV9Projects(repoProjects);

      client.cwd = join(tmpDir, 'apps', 'web');
      client.setArgv('link-2', '--yes');

      const code = await link2(client);
      expect(code).toBe(0);

      const repoJson = await readJSON(join(tmpDir, '.vercel', 'repo.json'));
      expect(repoJson.projects).toHaveLength(1);
      expect(repoJson.projects[0].name).toBe('web');
      expect(
        await pathExists(join(tmpDir, 'apps', 'web', '.vercel', 'project.json'))
      ).toBe(true);
      await expect(client.stderr).toOutput('Linked to');
    });

    it('from subfolder with potential project name match (suggest_potential): links and connects repo', async () => {
      useUser();
      const teamId = 'team_abc';
      useTeams(teamId);
      // Custom link handler so connectGitProvider succeeds (project not in useUnknownProject's create Map)
      const potentialProject = {
        id: 'proj_web_123',
        name: 'web',
        accountId: teamId,
        rootDirectory: undefined,
        link: undefined,
      } as Project;
      client.scenario.post(
        '/v9/projects/:projectNameOrId/link',
        (req: any, res: any, next: any) => {
          if (
            req.params.projectNameOrId === 'proj_web_123' &&
            req.body?.repo === 'user/repo'
          ) {
            return res.json({
              ...potentialProject,
              link: {
                type: 'github',
                repo: 'user/repo',
                repoId: 1,
                org: teamId,
              },
            });
          }
          next();
        }
      );
      client.scenario.patch(
        '/v9/projects/:projectNameOrId',
        (req: any, res: any, next: any) => {
          if (req.params.projectNameOrId === 'proj_web_123') {
            return res.json({
              ...potentialProject,
              rootDirectory: req.body?.rootDirectory,
            });
          }
          next();
        }
      );
      useUnknownProject();

      const tmpDir = copyFixtureToTmp('monorepo-linked');
      tmpDirs.push(tmpDir);
      await setupGitRepo(tmpDir, 'https://github.com/user/repo.git');
      mockV9Projects([], [potentialProject]);

      client.cwd = join(tmpDir, 'apps', 'web');
      client.setArgv('link-2', '--yes');

      const code = await link2(client);
      expect(code).toBe(0);

      const repoJson = await readJSON(join(tmpDir, '.vercel', 'repo.json'));
      expect(repoJson.projects).toHaveLength(1);
      expect(repoJson.projects[0].name).toBe('web');
      expect(
        await pathExists(join(tmpDir, 'apps', 'web', '.vercel', 'project.json'))
      ).toBe(true);
      await expect(client.stderr).toOutput('Linked to');
    });

    it('from subfolder with no repo project, framework detected (offer_create): errors, does not create', async () => {
      useUser();
      const teamId = 'team_abc';
      useTeams(teamId);
      useUnknownProject();

      const tmpDir = copyFixtureToTmp('monorepo-linked');
      tmpDirs.push(tmpDir);
      rmSync(join(tmpDir, '.vercel'), { recursive: true, force: true });
      await setupGitRepo(tmpDir, 'https://github.com/user/repo.git');
      mockV9Projects([]);

      client.cwd = join(tmpDir, 'apps', 'web');
      client.setArgv('link-2', '--yes');

      const code = await link2(client);
      expect(code).toBe(1);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Project creation requires interactive mode');
      expect(stderr).toContain('--yes');
      expect(await pathExists(join(tmpDir, '.vercel', 'repo.json'))).toBe(
        false
      );
    });

    it('from subfolder: name-matched project linked to another repo is not suggested (offer_create path, errors)', async () => {
      useUser();
      const teamId = 'team_abc';
      useTeams(teamId);
      useUnknownProject();

      const tmpDir = copyFixtureToTmp('monorepo-linked');
      tmpDirs.push(tmpDir);
      rmSync(join(tmpDir, '.vercel'), { recursive: true, force: true });
      await setupGitRepo(tmpDir, 'https://github.com/user/repo.git');
      // Project "web" exists and name matches folder, but it is git-connected to a different repo
      const projectLinkedToOtherRepo = {
        id: 'proj_web_other',
        name: 'web',
        accountId: teamId,
        rootDirectory: undefined,
        link: {
          type: 'github',
          repo: 'other-org/other-repo',
          repoId: 999,
          org: teamId,
          gitCredentialId: '',
          sourceless: true,
          createdAt: 0,
          updatedAt: 0,
        },
      } as Project;
      mockV9Projects([], [projectLinkedToOtherRepo]);

      client.cwd = join(tmpDir, 'apps', 'web');
      client.setArgv('link-2', '--yes');

      const code = await link2(client);
      expect(code).toBe(1);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Project creation requires interactive mode');
      // We hit offer_create (no suggest_potential because project linked elsewhere); --yes does not create
      expect(await pathExists(join(tmpDir, '.vercel', 'repo.json'))).toBe(
        false
      );
    });
  });

  describe('interactive', () => {
    it('at repo root with one repo project: confirms "Link to it?", then links', async () => {
      useUser();
      const teamId = 'team_abc';
      useTeams(teamId);
      useUnknownProject();

      const tmpDir = copyFixtureToTmp('monorepo-linked');
      tmpDirs.push(tmpDir);
      await setupGitRepo(tmpDir);

      // rootDirectory '.' so we get link_one (single project at repo root)
      const repoProjects: Project[] = [
        {
          id: 'proj_root_1',
          name: 'my-app',
          accountId: teamId,
          rootDirectory: '.',
          link: {
            type: 'github',
            repo: 'org/repo',
            repoId: 1,
            org: teamId,
            gitCredentialId: '',
            sourceless: true,
            createdAt: 0,
            updatedAt: 0,
          },
        } as Project,
      ];
      mockV9Projects(repoProjects);

      client.cwd = tmpDir;
      client.setArgv('link-2');

      const exitCodePromise = link2(client);

      await expect(client.stderr).toOutput('Link to it?');
      acceptConfirmDefault();

      await expect(client.stderr).toOutput('Linked');
      await expect(client.stderr).toOutput('pull environment');
      acceptConfirmDefault(); // default No — skip env pull

      const code = await exitCodePromise;
      expect(code).toBe(0);

      const repoJson = await readJSON(join(tmpDir, '.vercel', 'repo.json'));
      expect(repoJson.projects).toHaveLength(1);
      expect(repoJson.projects[0].name).toBe('my-app');
    });

    it('from subfolder with repo project (prompt_link_existing): prompts "Link to X?" then links', async () => {
      useUser();
      const teamId = 'team_abc';
      useTeams(teamId);
      useUnknownProject();

      const tmpDir = copyFixtureToTmp('monorepo-linked');
      tmpDirs.push(tmpDir);
      await setupGitRepo(tmpDir);

      const repoProjects: Project[] = [
        {
          id: 'proj_web_123',
          name: 'web',
          accountId: teamId,
          rootDirectory: 'apps/web',
          link: {
            type: 'github',
            repo: 'org/repo',
            repoId: 1,
            org: teamId,
            gitCredentialId: '',
            sourceless: true,
            createdAt: 0,
            updatedAt: 0,
          },
        } as Project,
      ];
      mockV9Projects(repoProjects);

      client.cwd = join(tmpDir, 'apps', 'web');
      client.setArgv('link-2');

      const exitCodePromise = link2(client);

      await expect(client.stderr).toOutput('Link to');
      acceptConfirmDefault(); // default is yes

      await expect(client.stderr).toOutput('pull environment');
      acceptConfirmDefault(); // default No

      const code = await exitCodePromise;
      expect(code).toBe(0);

      const repoJson = await readJSON(join(tmpDir, '.vercel', 'repo.json'));
      expect(repoJson.projects).toHaveLength(1);
      expect(repoJson.projects[0].name).toBe('web');
    });

    it('from subfolder with potential project (suggest_potential): prompts link, connect, root dir, then links', async () => {
      useUser();
      const teamId = 'team_abc';
      useTeams(teamId);
      const potentialProject = {
        id: 'proj_web_123',
        name: 'web',
        accountId: teamId,
        rootDirectory: undefined,
        link: undefined,
      } as Project;
      client.scenario.post(
        '/v9/projects/:projectNameOrId/link',
        (req: any, res: any, next: any) => {
          if (
            req.params.projectNameOrId === 'proj_web_123' &&
            req.body?.repo === 'user/repo'
          ) {
            return res.json({
              ...potentialProject,
              link: {
                type: 'github',
                repo: 'user/repo',
                repoId: 1,
                org: teamId,
              },
            });
          }
          next();
        }
      );
      client.scenario.patch(
        '/v9/projects/:projectNameOrId',
        (req: any, res: any, next: any) => {
          if (req.params.projectNameOrId === 'proj_web_123') {
            return res.json({
              ...potentialProject,
              rootDirectory: req.body?.rootDirectory,
            });
          }
          next();
        }
      );
      useUnknownProject();

      const tmpDir = copyFixtureToTmp('monorepo-linked');
      tmpDirs.push(tmpDir);
      await setupGitRepo(tmpDir, 'https://github.com/user/repo.git');
      mockV9Projects([], [potentialProject]);

      client.cwd = join(tmpDir, 'apps', 'web');
      client.setArgv('link-2');

      const exitCodePromise = link2(client);

      await expect(client.stderr).toOutput('Link to existing project');
      acceptConfirmDefault();

      await expect(client.stderr).toOutput('Connect this repo');
      acceptConfirmDefault();

      await expect(client.stderr).toOutput('Set Root Directory');
      acceptConfirmDefault();

      await expect(client.stderr).toOutput('pull environment');
      acceptConfirmDefault(); // default No

      const code = await exitCodePromise;
      expect(code).toBe(0);

      const repoJson = await readJSON(join(tmpDir, '.vercel', 'repo.json'));
      expect(repoJson.projects).toHaveLength(1);
      expect(repoJson.projects[0].name).toBe('web');
    });

    it('from subfolder with no repo project (offer_create): prompts "Create new project" then creates and links', async () => {
      useUser();
      const teamId = 'team_abc';
      useTeams(teamId);
      useUnknownProject();

      const tmpDir = copyFixtureToTmp('monorepo-linked');
      tmpDirs.push(tmpDir);
      await setupGitRepo(tmpDir, 'https://github.com/user/repo.git');
      mockV9Projects([]);

      client.cwd = join(tmpDir, 'apps', 'web');
      client.setArgv('link-2');

      const exitCodePromise = link2(client);

      await expect(client.stderr).toOutput('Create new project');
      acceptConfirmDefault();

      await expect(client.stderr).toOutput(
        'Which scope should your new Project be created under?'
      );
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('pull environment');
      acceptConfirmDefault(); // default No

      const code = await exitCodePromise;
      expect(code).toBe(0);

      const repoJson = await readJSON(join(tmpDir, '.vercel', 'repo.json'));
      expect(repoJson.projects).toHaveLength(1);
      expect(repoJson.projects[0].name).toBe('web');
    });

    it('at repo root with two repo projects and --yes: pulls env once per linked project', async () => {
      useUser();
      const teamId = 'team_abc';
      useTeams(teamId);
      useUnknownProject();

      const tmpDir = copyFixtureToTmp('monorepo-linked');
      tmpDirs.push(tmpDir);
      await setupGitRepo(tmpDir);

      const repoProjects: Project[] = [
        {
          id: 'proj_web_123',
          name: 'web',
          accountId: teamId,
          rootDirectory: 'apps/web',
          link: {
            type: 'github',
            repo: 'org/repo',
            repoId: 1,
            org: teamId,
            gitCredentialId: '',
            sourceless: true,
            createdAt: 0,
            updatedAt: 0,
          },
        } as Project,
        {
          id: 'proj_api_456',
          name: 'api',
          accountId: teamId,
          rootDirectory: 'apps/api',
          link: {
            type: 'github',
            repo: 'org/repo',
            repoId: 1,
            org: teamId,
            gitCredentialId: '',
            sourceless: true,
            createdAt: 0,
            updatedAt: 0,
          },
        } as Project,
      ];
      mockV9Projects(repoProjects);

      client.cwd = tmpDir;
      client.setArgv('link-2', '--yes');

      const code = await link2(client);
      expect(code).toBe(0);
      expect(mockPull).toHaveBeenCalledTimes(2);
    });

    it('at repo root with two repo projects: yes to env pull then checkbox submits all selected', async () => {
      useUser();
      const teamId = 'team_abc';
      useTeams(teamId);
      useUnknownProject();

      const tmpDir = copyFixtureToTmp('monorepo-linked');
      tmpDirs.push(tmpDir);
      await setupGitRepo(tmpDir);

      const repoProjects: Project[] = [
        {
          id: 'proj_web_123',
          name: 'web',
          accountId: teamId,
          rootDirectory: 'apps/web',
          link: {
            type: 'github',
            repo: 'org/repo',
            repoId: 1,
            org: teamId,
            gitCredentialId: '',
            sourceless: true,
            createdAt: 0,
            updatedAt: 0,
          },
        } as Project,
        {
          id: 'proj_api_456',
          name: 'api',
          accountId: teamId,
          rootDirectory: 'apps/api',
          link: {
            type: 'github',
            repo: 'org/repo',
            repoId: 1,
            org: teamId,
            gitCredentialId: '',
            sourceless: true,
            createdAt: 0,
            updatedAt: 0,
          },
        } as Project,
      ];
      mockV9Projects(repoProjects);

      client.cwd = tmpDir;
      client.setArgv('link-2');

      const exitCodePromise = link2(client);

      await expect(client.stderr).toOutput('Linked 2 project(s)');
      await expect(client.stderr).toOutput('pull environment');
      client.stdin.write('y\n');
      await expect(client.stderr).toOutput(
        'Which projects should environment variables be pulled for?'
      );
      client.stdin.write('\n');

      const code = await exitCodePromise;
      expect(code).toBe(0);
      expect(mockPull).toHaveBeenCalledTimes(2);
    });

    it('prompt_link_existing: user declines "Link to X?" then nothing written', async () => {
      useUser();
      const teamId = 'team_abc';
      useTeams(teamId);
      useUnknownProject();

      const tmpDir = copyFixtureToTmp('monorepo-linked');
      tmpDirs.push(tmpDir);
      rmSync(join(tmpDir, '.vercel'), { recursive: true, force: true });
      await setupGitRepo(tmpDir);

      const repoProjects: Project[] = [
        {
          id: 'proj_web_123',
          name: 'web',
          accountId: teamId,
          rootDirectory: 'apps/web',
          link: {
            type: 'github',
            repo: 'org/repo',
            repoId: 1,
            org: teamId,
            gitCredentialId: '',
            sourceless: true,
            createdAt: 0,
            updatedAt: 0,
          },
        } as Project,
      ];
      mockV9Projects(repoProjects);

      client.cwd = join(tmpDir, 'apps', 'web');
      client.setArgv('link-2');

      const exitCodePromise = link2(client);

      await expect(client.stderr).toOutput('Link to');
      declineConfirm();

      await expect(client.stderr).toOutput('existing project or create');
      client.stdin.write('\n'); // choose "Link to an existing project"
      // Only one project (web) in scope; it was declined so list is empty → nothing written

      const code = await exitCodePromise;
      expect(code).toBe(0);

      const repoPath = join(tmpDir, '.vercel', 'repo.json');
      expect(await pathExists(repoPath)).toBe(false);
    });
  });

  describe('edge: requires confirmation when non-interactive', () => {
    it('errors when offer_create path', async () => {
      useUser();
      useTeams('team_abc');
      useUnknownProject();

      const tmpDir = copyFixtureToTmp('monorepo-linked');
      tmpDirs.push(tmpDir);
      await setupGitRepo(tmpDir);
      mockV9Projects([]);

      // From apps/web (subfolder) with no repo project for that path but framework detected -> offer_create
      client.cwd = join(tmpDir, 'apps', 'web');
      client.setArgv('link-2');
      (client.stdin as { isTTY?: boolean }).isTTY = false;

      const code = await link2(client);
      expect(code).toBe(1);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Project creation requires interactive mode');
      expect(stderr).toContain('--yes');

      (client.stdin as { isTTY?: boolean }).isTTY = true;
    });
  });
});
