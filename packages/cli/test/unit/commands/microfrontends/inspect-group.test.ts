import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import microfrontends from '../../../../src/commands/microfrontends';
import { teamCache } from '../../../../src/util/teams/get-team-by-id';
import type { MicrofrontendsGroupsResponse } from '../../../../src/commands/microfrontends/types';

const groupsResponse: MicrofrontendsGroupsResponse = {
  groups: [
    {
      group: {
        id: 'group_1',
        slug: 'my-group',
        name: 'My Group',
      },
      projects: [
        {
          id: 'proj_web',
          name: 'web',
          microfrontends: {
            isDefaultApp: true,
            enabled: true,
            defaultRoute: '/',
          },
        },
        {
          id: 'proj_docs',
          name: 'docs',
          microfrontends: {
            isDefaultApp: false,
            enabled: true,
            defaultRoute: '/docs',
          },
        },
      ],
      config: {
        applications: {
          web: {
            development: {
              fallback: 'my-group.vercel.app',
            },
          },
          docs: {
            routing: [{ paths: ['/docs', '/docs/*'] }],
          },
        },
      },
    },
  ],
  maxMicrofrontendsGroupsPerTeam: 10,
  maxMicrofrontendsPerGroup: 20,
};

interface SetupMocksOptions {
  projectIdsNotFound?: string[];
}

function setupMocks(options: SetupMocksOptions = {}) {
  const { projectIdsNotFound = [] } = options;
  client.config.currentTeam = 'team_123';

  client.scenario.get('/v2/user', (_req, res) => {
    res.json({ user: { id: 'user_123', username: 'testuser' } });
  });

  client.scenario.get('/teams/team_123', (_req, res) => {
    res.json({
      id: 'team_123',
      slug: 'my-team',
      name: 'My Team',
      billing: { plan: 'pro', period: { start: 0, end: 0 }, addons: [] },
    });
  });

  client.scenario.get('/v1/microfrontends/groups', (_req, res) => {
    res.json(groupsResponse);
  });

  client.scenario.get('/v9/projects/:projectId', (req, res) => {
    const projectId = req.params.projectId;
    if (projectIdsNotFound.includes(projectId)) {
      res.status(404).json({ error: { code: 'not_found' } });
      return;
    }
    if (projectId === 'proj_web') {
      res.json({
        id: 'proj_web',
        name: 'web',
        accountId: 'team_123',
        updatedAt: Date.now(),
        createdAt: Date.now(),
        framework: 'nextjs',
        targets: {
          production: {
            alias: ['web-production.vercel.app'],
            url: 'web-production.vercel.app',
          },
        },
        rootDirectory: 'apps/web',
        link: {
          type: 'github',
          repo: 'vercel/front',
          org: 'vercel',
          repoId: 1,
          gitCredentialId: 'cred_1',
          sourceless: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      });
      return;
    }

    res.json({
      id: 'proj_docs',
      name: 'docs',
      accountId: 'team_123',
      updatedAt: Date.now(),
      createdAt: Date.now(),
      framework: 'nextjs',
      targets: {
        production: {
          alias: ['docs-production.vercel.app'],
          url: 'docs-production.vercel.app',
        },
      },
      rootDirectory: 'apps/docs',
      link: {
        type: 'github',
        repo: 'vercel/docs',
        org: 'vercel',
        repoId: 2,
        gitCredentialId: 'cred_2',
        sourceless: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    });
  });
}

describe('microfrontends inspect-group', () => {
  beforeEach(() => {
    client.reset();
    teamCache.clear();
    setupMocks();
  });

  it('prints usage with --help', async () => {
    client.setArgv('microfrontends', 'inspect-group', '--help');
    const exitCode = await microfrontends(client);
    expect(exitCode).toBe(2);
  });

  it('outputs JSON when --format=json is provided', async () => {
    client.setArgv(
      'microfrontends',
      'inspect-group',
      '--group=My Group',
      '--format=json'
    );

    const exitCode = await microfrontends(client);

    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput().trim();
    const parsed = JSON.parse(stdout);

    expect(Object.keys(parsed).sort()).toEqual(
      [
        'config',
        'configFile',
        'defaultApp',
        'group',
        'projectCount',
        'projects',
      ].sort()
    );
    expect(Object.keys(parsed.group).sort()).toEqual(
      ['fallbackEnvironment', 'id', 'name', 'slug'].sort()
    );

    expect(parsed.group.name).toBe('My Group');
    expect(parsed.group.id).toBe('group_1');
    expect(parsed.defaultApp).toBe('web');
    expect(parsed.configFile).toBe(null);
    expect(parsed.projects).toHaveLength(2);
    expect(Object.keys(parsed.projects[0]).sort()).toEqual(
      [
        'defaultRoute',
        'enabled',
        'framework',
        'git',
        'id',
        'inGroupConfig',
        'isDefaultApp',
        'name',
        'packageName',
        'productionDomain',
        'projectFetchStatus',
      ].sort()
    );
    expect(parsed.projects[0]).toMatchObject({
      id: 'proj_web',
      name: 'web',
      isDefaultApp: true,
      productionDomain: 'web-production.vercel.app',
      framework: 'nextjs',
      git: {
        org: 'vercel',
        repo: 'vercel/front',
        rootDirectory: 'apps/web',
      },
      packageName: null,
      inGroupConfig: true,
      projectFetchStatus: 'ok',
    });
  });

  it('resolves group by slug', async () => {
    client.setArgv(
      'microfrontends',
      'inspect-group',
      '--group=my-group',
      '--format=json'
    );

    const exitCode = await microfrontends(client);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput().trim());
    expect(parsed.group).toMatchObject({
      id: 'group_1',
      slug: 'my-group',
      name: 'My Group',
    });
  });

  it('marks project as not_found when project metadata 404s', async () => {
    client.reset();
    teamCache.clear();
    setupMocks({ projectIdsNotFound: ['proj_docs'] });
    client.setArgv(
      'microfrontends',
      'inspect-group',
      '--group=My Group',
      '--format=json'
    );

    const exitCode = await microfrontends(client);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput().trim());
    const docs = parsed.projects.find((p: any) => p.id === 'proj_docs');
    expect(docs).toMatchObject({
      id: 'proj_docs',
      projectFetchStatus: 'not_found',
      framework: null,
      productionDomain: null,
      packageName: null,
    });
  });

  it('prints one project table per project in text output', async () => {
    client.setArgv('microfrontends', 'inspect-group', '--group=My Group');
    const exitCode = await microfrontends(client);

    expect(exitCode).toBe(0);
    const stderrOutput = client.stderr.getFullOutput();
    expect(stderrOutput).toContain('Projects');
    expect(stderrOutput).toContain('Project            web (default app)');
    expect(stderrOutput).toContain('Project            docs');
    expect(stderrOutput).not.toContain('Enabled');
    expect(stderrOutput).not.toContain('Fetch status');
    expect(stderrOutput).not.toContain('ID                 proj_');
  });

  it('errors when --config-file-name has an invalid extension', async () => {
    client.setArgv(
      'microfrontends',
      'inspect-group',
      '--group=My Group',
      '--config-file-name=microfrontends.txt',
      '--format=json'
    );

    const exitCodePromise = microfrontends(client);

    await expect(client.stderr).toOutput(
      'Error: Invalid --config-file-name. Value must end with .json or .jsonc.'
    );
    expect(await exitCodePromise).toBe(1);
  });

  it('errors in non-TTY mode without --group', async () => {
    client.setArgv('microfrontends', 'inspect-group');
    (client.stdin as any).isTTY = false;

    const exitCodePromise = microfrontends(client);

    await expect(client.stderr).toOutput(
      'Error: Missing required flag --group.'
    );
    expect(await exitCodePromise).toBe(1);
    (client.stdin as any).isTTY = true;
  });
});
