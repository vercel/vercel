import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import open from 'open';
import pull from '../../../../src/commands/env/pull';
import install from '../../../../src/commands/install';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import {
  useIntegration,
  usePreauthorization,
} from '../../../mocks/integration';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams, type Team } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

vi.mock('open', () => {
  return {
    default: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../../../src/commands/env/pull', () => {
  return {
    default: vi.fn().mockResolvedValue(0),
  };
});

const openMock = vi.mocked(open);
const pullMock = vi.mocked(pull);

beforeEach(() => {
  openMock.mockReset().mockResolvedValue(undefined as never);
  pullMock.mockClear();
  vi.spyOn(Math, 'random').mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('install', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'install';

      client.setArgv(command, '--help');
      const exitCodePromise = install(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  describe('[integration]', () => {
    let team: Team;

    beforeEach(() => {
      useUser();
      const teams = useTeams('team_dummy');
      team = Array.isArray(teams) ? teams[0] : teams.teams[0];
      client.config.currentTeam = team.id;
    });

    it('is an alias for "integration add"', async () => {
      useIntegration({ withInstallation: true, ownerId: team.id });
      usePreauthorization();
      useProject({
        ...defaultProject,
        id: 'vercel-integration-add',
        name: 'vercel-integration-add',
      });
      const cwd = setupUnitFixture('vercel-integration-add');
      client.cwd = cwd;
      client.setArgv('install', 'acme');
      const exitCodePromise = install(client);
      await expect(client.stderr).toOutput(
        `Installing Acme Product by Acme Integration under ${team.slug}`
      );
      await expect(client.stderr).toOutput(
        'Choose your region (Use arrow keys)'
      );
      client.stdin.write('\n');
      await expect(client.stderr).toOutput(
        'Choose a billing plan (Use arrow keys)'
      );
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Confirm selection? (Y/n)');
      client.stdin.write('y\n');
      await expect(client.stderr).toOutput(
        'Acme Product successfully provisioned: acme-gray-apple'
      );
      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
    });

    it('forwards --name flag', async () => {
      useIntegration({ withInstallation: true, ownerId: team.id });
      usePreauthorization();
      useProject({
        ...defaultProject,
        id: 'vercel-integration-add',
        name: 'vercel-integration-add',
      });
      const cwd = setupUnitFixture('vercel-integration-add');
      client.cwd = cwd;
      client.setArgv('install', 'acme', '--name', 'my-db');
      const exitCodePromise = install(client);
      await expect(client.stderr).toOutput(
        `Installing Acme Product by Acme Integration under ${team.slug}`
      );
      await expect(client.stderr).toOutput(
        'Choose your region (Use arrow keys)'
      );
      client.stdin.write('\n');
      await expect(client.stderr).toOutput(
        'Choose a billing plan (Use arrow keys)'
      );
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Confirm selection? (Y/n)');
      client.stdin.write('y\n');
      await expect(client.stderr).toOutput(
        'Acme Product successfully provisioned: my-db'
      );
      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
    });

    it('forwards --no-connect flag', async () => {
      useIntegration({ withInstallation: true, ownerId: team.id });
      usePreauthorization();
      useProject({
        ...defaultProject,
        id: 'vercel-integration-add',
        name: 'vercel-integration-add',
      });
      const cwd = setupUnitFixture('vercel-integration-add');
      client.cwd = cwd;
      client.setArgv('install', 'acme', '--no-connect');
      const exitCodePromise = install(client);
      await expect(client.stderr).toOutput(
        'Choose your region (Use arrow keys)'
      );
      client.stdin.write('\n');
      await expect(client.stderr).toOutput(
        'Choose a billing plan (Use arrow keys)'
      );
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Confirm selection? (Y/n)');
      client.stdin.write('y\n');
      await expect(client.stderr).toOutput(
        'Acme Product successfully provisioned: acme-gray-apple'
      );
      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      expect(openMock).not.toHaveBeenCalled();
      expect(pullMock).not.toHaveBeenCalled();
    });

    it('forwards --no-env-pull flag', async () => {
      useIntegration({ withInstallation: true, ownerId: team.id });
      usePreauthorization();
      useProject({
        ...defaultProject,
        id: 'vercel-integration-add',
        name: 'vercel-integration-add',
      });
      const cwd = setupUnitFixture('vercel-integration-add');
      client.cwd = cwd;
      client.setArgv('install', 'acme', '--no-env-pull');
      const exitCodePromise = install(client);
      await expect(client.stderr).toOutput(
        'Choose your region (Use arrow keys)'
      );
      client.stdin.write('\n');
      await expect(client.stderr).toOutput(
        'Choose a billing plan (Use arrow keys)'
      );
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Confirm selection? (Y/n)');
      client.stdin.write('y\n');
      await expect(client.stderr).toOutput(
        'Acme Product successfully provisioned: acme-gray-apple'
      );
      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      expect(pullMock).not.toHaveBeenCalled();
    });

    it('forwards --metadata flag', async () => {
      useIntegration({ withInstallation: true, ownerId: team.id });
      client.setArgv('install', 'acme', '--metadata', 'region=invalid-region');
      const exitCode = await install(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'Error: Metadata "region" must be one of: us-west-1, us-east-1'
      );
    });

    it('forwards --plan flag', async () => {
      useIntegration({ withInstallation: true, ownerId: team.id });
      usePreauthorization();
      client.setArgv('install', 'acme', '--plan', 'nonexistent');
      const exitCodePromise = install(client);
      await expect(client.stderr).toOutput(
        'Choose your region (Use arrow keys)'
      );
      client.stdin.write('\n');
      await expect(client.stderr).toOutput(
        'Error: Billing plan "nonexistent" not found. Available plans: pro, team'
      );
      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(1);
    });

    it('forwards --environment flag', async () => {
      client.setArgv('install', 'acme', '--environment', 'staging');
      const exitCode = await install(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'Error: Invalid environment value: "staging". Must be one of: production, preview, development'
      );
    });

    it('forwards -e shorthand', async () => {
      client.setArgv('install', 'acme', '-e', 'staging', '-e', 'test');
      const exitCode = await install(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'Error: Invalid environment value: "staging", "test". Must be one of: production, preview, development'
      );
    });

    it('propagates exit code from add()', async () => {
      client.setArgv('install');
      const exitCode = await install(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'Error: You must pass an integration slug'
      );
    });

    it('returns 1 for unknown flags', async () => {
      client.setArgv('install', 'acme', '--unknown-flag');
      const exitCode = await install(client);
      expect(exitCode).toEqual(1);
    });
  });
});
