import { beforeEach, describe, expect, it, vi } from 'vitest';
import deployButtonCommand from '../../../../src/commands/deploy-button';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { defaultProject, useProject } from '../../../mocks/project';
import { type Team, useTeams } from '../../../mocks/team';
import type { Resource } from '../../../../src/util/integration-resource/types';
import type { Configuration } from '../../../../src/util/integration/types';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('deploy-button', () => {
  let team: Team;

  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    client.stdin.isTTY = false;
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        description: 'A test repo',
        homepage: 'https://example.com',
        private: false,
      }),
    });
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'deploy-button';
      client.setArgv(command, '--help');
      const exitCode = await deployButtonCommand(client);
      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });

    it('prints help message', async () => {
      client.setArgv('deploy-button', '--help');
      const exitCode = await deployButtonCommand(client);
      expect(exitCode).toEqual(0);
      expect(client.getFullOutput()).toContain('deploy-button');
    });
  });

  describe('errors', () => {
    beforeEach(() => {
      useUser();
      const teams = useTeams('team_dummy');
      team = Array.isArray(teams) ? teams[0] : teams.teams[0];
      client.config.currentTeam = team.id;
    });

    it('errors when no git repo is connected', async () => {
      const cwd = setupUnitFixture('commands/deploy-button');
      client.cwd = cwd;
      useProject({
        ...defaultProject,
        id: 'deploy-button-test',
        name: 'deploy-button-test',
        link: undefined,
      });

      client.setArgv('deploy-button');
      const exitCode = await deployButtonCommand(client);
      expect(exitCode).toEqual(1);
      expect(client.getFullOutput()).toContain('No Git repository connected');
    });

    it('errors when repo is private', async () => {
      const cwd = setupUnitFixture('commands/deploy-button');
      client.cwd = cwd;
      useProject({
        ...defaultProject,
        id: 'deploy-button-test',
        name: 'deploy-button-test',
        link: {
          type: 'github',
          repo: 'my-app',
          repoId: 1010,
          org: 'my-org',
          gitCredentialId: '',
          sourceless: true,
          createdAt: 1656109539791,
          updatedAt: 1656109539791,
        },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          description: '',
          homepage: '',
          private: true,
        }),
      });

      setupMockApis({ resources: [], configurations: [] });

      client.setArgv('deploy-button', '--yes');
      const exitCode = await deployButtonCommand(client);
      expect(exitCode).toEqual(1);
      expect(client.getFullOutput()).toContain('linked repository is private');
    });
  });

  describe('URL generation', () => {
    beforeEach(() => {
      useUser();
      const teams = useTeams('team_dummy');
      team = Array.isArray(teams) ? teams[0] : teams.teams[0];
      client.config.currentTeam = team.id;
    });

    function setupLinkedProject() {
      const cwd = setupUnitFixture('commands/deploy-button');
      client.cwd = cwd;
      useProject({
        ...defaultProject,
        id: 'deploy-button-test',
        name: 'deploy-button-test',
        link: {
          type: 'github',
          repo: 'my-app',
          repoId: 1010,
          org: 'my-org',
          gitCredentialId: '',
          sourceless: true,
          createdAt: 1656109539791,
          updatedAt: 1656109539791,
        },
      });
    }

    it('generates basic deploy button URL', async () => {
      setupLinkedProject();
      setupMockApis({ resources: [], configurations: [] });

      client.setArgv('deploy-button', '--yes');
      const exitCode = await deployButtonCommand(client);
      expect(exitCode).toEqual(0);

      const output = client.getFullOutput();
      expect(output).toContain(
        'repository-url=https%3A%2F%2Fgithub.com%2Fmy-org%2Fmy-app'
      );
      expect(output).toContain('repository-name=my-app');
    });

    it('includes env vars without contentHint', async () => {
      const cwd = setupUnitFixture('commands/deploy-button');
      client.cwd = cwd;
      useProject(
        {
          ...defaultProject,
          id: 'deploy-button-test',
          name: 'deploy-button-test',
          link: {
            type: 'github',
            repo: 'my-app',
            repoId: 1010,
            org: 'my-org',
            gitCredentialId: '',
            sourceless: true,
            createdAt: 1656109539791,
            updatedAt: 1656109539791,
          },
        },
        [
          {
            type: 'encrypted',
            id: 'env1',
            key: 'API_KEY',
            value: 'secret',
            target: ['production'],
            configurationId: null,
            updatedAt: 1557241361455,
            createdAt: 1557241361455,
          },
          {
            type: 'encrypted',
            id: 'env2',
            key: 'DB_URL',
            value: 'managed',
            target: ['production'],
            configurationId: null,
            updatedAt: 1557241361455,
            createdAt: 1557241361455,
            contentHint: { type: 'integration-store-secret' },
          } as any,
        ]
      );
      setupMockApis({ resources: [], configurations: [] });

      client.setArgv('deploy-button', '--yes');
      const exitCode = await deployButtonCommand(client);
      expect(exitCode).toEqual(0);

      const output = client.getFullOutput();
      expect(output).toContain('env=API_KEY');
      expect(output).not.toContain('DB_URL');
    });

    it('includes stores for project-connected resources', async () => {
      setupLinkedProject();
      setupMockApis({
        resources: [
          {
            id: 'store_blob',
            type: 'blob',
            name: 'my-blob',
            externalResourceId: 'ext_blob',
            projectsMetadata: [
              {
                id: 'spc_1',
                projectId: 'deploy-button-test',
                name: 'deploy-button-test',
                environments: ['production'],
              },
            ],
          },
          {
            id: 'store_turso',
            type: 'integration',
            name: 'my-turso-db',
            externalResourceId: 'ext_turso',
            product: {
              name: 'Turso',
              slug: 'database',
              integrationConfigurationId: 'icfg_turso',
              primaryProtocol: 'storage',
            },
            projectsMetadata: [
              {
                id: 'spc_2',
                projectId: 'deploy-button-test',
                name: 'deploy-button-test',
                environments: ['production'],
              },
            ],
          },
          {
            id: 'store_other',
            type: 'integration',
            name: 'other-project-db',
            externalResourceId: 'ext_other',
            product: {
              name: 'Neon',
              slug: 'neon',
              integrationConfigurationId: 'icfg_neon',
              primaryProtocol: 'storage',
            },
            projectsMetadata: [
              {
                id: 'spc_3',
                projectId: 'other-project',
                name: 'other-project',
                environments: ['production'],
              },
            ],
          },
        ],
        configurations: [
          {
            id: 'icfg_turso',
            integrationId: 'oac_turso',
            ownerId: 'team_dummy',
            slug: 'tursocloud',
            teamId: 'team_dummy',
            userId: 'user_dummy',
            scopes: [],
            source: 'marketplace',
            installationType: 'marketplace',
            projects: [],
          },
          {
            id: 'icfg_neon',
            integrationId: 'oac_neon',
            ownerId: 'team_dummy',
            slug: 'neon',
            teamId: 'team_dummy',
            userId: 'user_dummy',
            scopes: [],
            source: 'marketplace',
            installationType: 'marketplace',
            projects: [],
          },
        ],
      });

      client.setArgv('deploy-button', '--yes');
      const exitCode = await deployButtonCommand(client);
      expect(exitCode).toEqual(0);

      const output = client.getFullOutput();
      const url = new URL(
        output.match(/https:\/\/vercel\.com\/new\/clone[^\s)]+/)?.[0] ?? ''
      );
      const stores = JSON.parse(url.searchParams.get('stores') ?? '[]');

      expect(stores).toHaveLength(2);
      expect(stores).toContainEqual({ type: 'blob' });
      expect(stores).toContainEqual({
        type: 'integration',
        integrationSlug: 'tursocloud',
        productSlug: 'database',
        protocol: 'storage',
      });
      expect(output).not.toContain('neon');
    });

    it('excludes integration-ids in non-TTY mode', async () => {
      setupLinkedProject();
      setupMockApis({
        resources: [],
        configurations: [
          {
            id: 'icfg_sentry',
            integrationId: 'oac_sentry',
            ownerId: 'team_dummy',
            slug: 'sentry',
            teamId: 'team_dummy',
            userId: 'user_dummy',
            scopes: [],
            source: 'marketplace',
            installationType: 'marketplace',
            projects: ['deploy-button-test'],
            projectSelection: 'selected',
            integration: { name: 'Sentry' },
          },
        ],
      });

      client.setArgv('deploy-button', '--yes');
      const exitCode = await deployButtonCommand(client);
      expect(exitCode).toEqual(0);

      const output = client.getFullOutput();
      expect(output).not.toContain('integration-ids');
    });

    it('outputs both deploy URL and markdown', async () => {
      setupLinkedProject();
      setupMockApis({ resources: [], configurations: [] });

      client.setArgv('deploy-button', '--yes');
      const exitCode = await deployButtonCommand(client);
      expect(exitCode).toEqual(0);

      const output = client.getFullOutput();
      expect(output).toContain('Deploy URL:');
      expect(output).toContain('vercel.com/new/clone');
      expect(output).toContain('[![Deploy with Vercel]');
      expect(output).toContain('https://vercel.com/button');
    });
  });
});

function setupMockApis({
  resources,
  configurations,
}: {
  resources: Resource[];
  configurations: Configuration[];
}) {
  client.scenario.get('/:version/storage/stores', (_req, res) => {
    res.json({ stores: resources });
  });

  client.scenario.get('/:version/integrations/configurations', (_req, res) => {
    res.json(configurations);
  });
}
