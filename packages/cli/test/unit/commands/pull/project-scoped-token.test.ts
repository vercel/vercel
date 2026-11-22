import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import pull from '../../../../src/commands/pull';
import env from '../../../../src/commands/env';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject } from '../../../mocks/project';

afterEach(() => {
  vi.unstubAllEnvs();
});

const project = {
  ...defaultProject,
  id: 'prj_scoped',
  name: 'scoped-project',
  accountId: 'team_scoped',
  framework: 'nextjs' as const,
  buildCommand: 'npm run build',
};
const localLink = {
  orgId: project.accountId,
  projectId: project.id,
  projectName: project.name,
};

// These commands need project access, not access to user/team resources. Keep
// both paths covered because `pull` and `env pull` use different resolvers.
describe.each([
  'pull',
  'env pull',
] as const)('%s with project-scoped access', command => {
  const run = () => (command === 'pull' ? pull(client) : env(client));
  const envPath = (cwd: string, environment = 'preview') =>
    path.join(
      cwd,
      command === 'pull' ? `.vercel/.env.${environment}.local` : '.env.local'
    );

  it.each([
    { source: 'directory', environment: 'preview', nonInteractive: true },
    { source: 'environment', environment: 'preview', nonInteractive: true },
    { source: 'project-id', environment: 'preview', nonInteractive: true },
    { source: 'project-name', environment: 'preview', nonInteractive: true },
    { source: 'repository', environment: 'preview', nonInteractive: true },
    { source: 'directory', environment: 'preview', nonInteractive: false },
    { source: 'directory', environment: 'development', nonInteractive: true },
    { source: 'directory', environment: 'production', nonInteractive: true },
    { source: 'directory', environment: 'staging', nonInteractive: true },
  ])('pulls using $source context ($environment, nonInteractive=$nonInteractive)', async ({
    source,
    environment,
    nonInteractive,
  }) => {
    const root = setupTmpDir('project-scoped-pull');
    client.cwd = root;
    client.nonInteractive = nonInteractive;
    client.stdin.isTTY = !nonInteractive;
    client.authConfig.token = 'vcp_test_token';
    // A previously selected team must not replace the resolved project's team.
    client.config.currentTeam = 'team_other';
    const args = [
      ...command.split(' '),
      '--yes',
      `--environment=${environment}`,
    ];

    if (source === 'directory') {
      await fs.outputJSON(path.join(root, '.vercel/project.json'), {
        ...localLink,
        settings: { buildCommand: 'stale-build' },
      });
    } else if (source === 'environment') {
      vi.stubEnv('VERCEL_ORG_ID', project.accountId);
      vi.stubEnv('VERCEL_PROJECT_ID', project.id);
    } else if (source === 'repository') {
      const projectCwd = path.join(root, 'apps/web');
      await fs.ensureDir(projectCwd);
      client.cwd = projectCwd;
      await fs.outputJSON(path.join(root, '.vercel/repo.json'), {
        remoteName: 'origin',
        projects: [
          {
            id: project.id,
            name: project.name,
            orgId: project.accountId,
            directory: 'apps/web',
          },
        ],
      });
    } else {
      args.push(
        '--project',
        source === 'project-id' ? project.id : project.name
      );
      client.config.currentTeam = project.accountId;
    }

    const requests: string[] = [];
    client.scenario.get('*', (req, res, next) => {
      requests.push(req.path);
      if (req.path === '/v2/user' || req.path.includes('/teams')) {
        return res.status(403).json({
          error: {
            code: 'team_unauthorized',
            message: 'Owner access denied',
          },
        });
      }
      next?.();
    });
    client.scenario.get('/v9/projects/:id', (req, res) => {
      expect(req.params.id).toBe(
        source === 'project-name' ? project.name : project.id
      );
      expect(req.query.teamId).toBe(project.accountId);
      expect(req.headers.authorization).toBe('Bearer vcp_test_token');
      res.json({
        ...project,
        rootDirectory: source === 'repository' ? 'apps/web' : null,
      });
    });
    client.scenario.get(
      `/v3/env/pull/${project.id}/${environment}`,
      (req, res) => {
        expect(req.query.teamId).toBe(project.accountId);
        res.json({ env: { TEST_VAR: 'test-only-value' } });
      }
    );
    client.setArgv(...args);

    await expect(run()).resolves.toBe(0);

    expect(requests).toEqual([
      `/v9/projects/${source === 'project-name' ? project.name : project.id}`,
      `/v3/env/pull/${project.id}/${environment}`,
    ]);
    expect(
      await fs.readFile(envPath(client.cwd, environment), 'utf8')
    ).toContain('TEST_VAR="test-only-value"');
    if (command === 'pull') {
      const settings = await fs.readJSON(
        path.join(client.cwd, '.vercel/project.json')
      );
      expect(settings.settings).toMatchObject({
        framework: 'nextjs',
        buildCommand: 'npm run build',
      });
      if (source === 'repository') {
        expect(settings).not.toHaveProperty('projectId');
        expect(settings).not.toHaveProperty('orgId');
      } else {
        expect(settings).toMatchObject(localLink);
      }
    }
    expect(client.config.currentTeam).toBe(project.accountId);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(`environment variables for ${project.name}`);
    expect(stderr).not.toContain(`/${project.name}`);
    expect(stderr).not.toContain(project.accountId);
    expect(stderr).not.toContain('Could not retrieve Project Settings');
    expect(stderr).not.toContain('test-only-value');
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it.each([
    'user_123',
    'legacyOwnerId',
  ])('preserves personal scoping for %s without printing an inferred owner', async orgId => {
    client.cwd = setupTmpDir('personal-project-pull');
    client.config.currentTeam = 'team_other';
    await fs.outputJSON(path.join(client.cwd, '.vercel/project.json'), {
      ...localLink,
      orgId,
    });
    const requests: string[] = [];
    client.scenario.get('*', (req, _res, next) => {
      requests.push(req.path);
      expect(req.query.teamId).toBeUndefined();
      next?.();
    });
    client.scenario.get(`/v9/projects/${project.id}`, (_req, res) => {
      res.json({ ...project, accountId: orgId });
    });
    client.scenario.get(`/v3/env/pull/${project.id}/preview`, (_req, res) => {
      res.json({ env: { TEST_VAR: 'test-only-value' } });
    });
    client.setArgv(...command.split(' '), '--yes', '--environment=preview');

    await expect(run()).resolves.toBe(0);
    expect(client.config.currentTeam).toBeUndefined();
    expect(requests).toEqual([
      `/v9/projects/${project.id}`,
      `/v3/env/pull/${project.id}/preview`,
    ]);
    expect(await fs.pathExists(envPath(client.cwd))).toBe(true);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(`environment variables for ${project.name}\n`);
    expect(stderr).not.toContain(orgId);
    expect(stderr).not.toContain(`/${project.name}`);
    expect(client.stdout.getFullOutput()).toBe('');
    if (command === 'pull') {
      expect(
        await fs.readJSON(path.join(client.cwd, '.vercel/project.json'))
      ).toMatchObject({ orgId });
    }
  });

  it.each([
    { status: 401, code: 'unauthorized' },
    { status: 403, code: 'forbidden' },
    { status: 403, code: 'team_unauthorized' },
    { status: 403, code: 'forbidden', invalidToken: true },
    { status: 404, code: 'not_found' },
  ])('does not pull when the project request returns $status/$code', async ({
    status,
    code,
    invalidToken,
  }) => {
    client.cwd = setupTmpDir('project-scoped-denied');
    vi.stubEnv('VERCEL_ORG_ID', project.accountId);
    vi.stubEnv('VERCEL_PROJECT_ID', project.id);
    const requests: string[] = [];
    client.scenario.get('*', (req, _res, next) => {
      requests.push(req.path);
      next?.();
    });
    client.scenario.get(`/v9/projects/${project.id}`, (_req, res) => {
      res.status(status).json({
        error: { code, message: 'Project access denied', invalidToken },
      });
    });
    client.setArgv(...command.split(' '), '--yes');

    if (status === 404) {
      await expect(run()).resolves.toBe(1);
    } else {
      await expect(run()).rejects.toThrow();
    }
    expect(requests).toEqual([`/v9/projects/${project.id}`]);
    expect(await fs.pathExists(envPath(client.cwd, 'development'))).toBe(false);
    expect(
      await fs.pathExists(path.join(client.cwd, '.vercel/project.json'))
    ).toBe(false);
  });

  it('preserves local files when the environment request is denied', async () => {
    client.cwd = setupTmpDir('project-scoped-env-denied');
    const settingsPath = path.join(client.cwd, '.vercel/project.json');
    const settings = {
      ...localLink,
      settings: { buildCommand: 'existing-build' },
    };
    await fs.outputJSON(settingsPath, settings);
    const existingEnv = '# Created by Vercel CLI\nTEST_VAR="existing-value"\n';
    await fs.outputFile(envPath(client.cwd), existingEnv);
    client.scenario.get(`/v9/projects/${project.id}`, (_req, res) => {
      res.json(project);
    });
    client.scenario.get(`/v3/env/pull/${project.id}/preview`, (_req, res) => {
      res.status(403).json({
        error: { code: 'forbidden', message: 'Environment access denied' },
      });
    });
    client.setArgv(...command.split(' '), '--yes', '--environment=preview');

    await expect(run()).rejects.toThrow('Environment access denied');
    expect(await fs.readFile(envPath(client.cwd), 'utf8')).toBe(existingEnv);
    expect(await fs.readJSON(settingsPath)).toEqual(settings);
    expect(client.stderr.getFullOutput()).not.toContain(
      'Downloaded project settings'
    );
  });
});
