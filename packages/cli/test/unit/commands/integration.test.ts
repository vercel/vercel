import { beforeEach, describe, expect, it, vi } from 'vitest';
import open from 'open';
import integrationCommand from '../../../src/commands/integration';
import { setupUnitFixture } from '../../helpers/setup-unit-fixture';
import { client } from '../../mocks/client';
import { useIntegration } from '../../mocks/integration';
import { defaultProject, useProject } from '../../mocks/project';
import { useTeams } from '../../mocks/team';
import { useUser } from '../../mocks/user';

vi.mock('open', () => {
  return {
    default: vi.fn(),
  };
});

const openMock = vi.mocked(open);

beforeEach(() => {
  openMock.mockClear();
});

describe('integration', () => {
  describe('add', () => {
    it('should handle provisioning resource in project context', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'vercel-integration-add',
        name: 'vercel-integration-add',
      });
      useIntegration();
      const cwd = setupUnitFixture('vercel-integration-add');
      client.cwd = cwd;
      client.config.currentTeam = 'team_dummy';
      client.setArgv('integration', 'add', 'acme');
      const exitCodePromise = integrationCommand(client);
      await expect(client.stderr).toOutput(
        'Do you want to link this resource to the current project? (Y/n)'
      );
      client.stdin.write('y\n');
      await expect(exitCodePromise).resolves.toEqual(0);
      expect(openMock).toHaveBeenCalledWith(
        'https://vercel.com/api/marketplace/cli?teamId=team_dummy&integrationId=acme&productId=acme-product&projectId=vercel-integration-add&cmd=add'
      );
    });

    it('should handle provisioning resource on team-level in project context', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'vercel-integration-add',
        name: 'vercel-integration-add',
      });
      useIntegration();
      const cwd = setupUnitFixture('vercel-integration-add');
      client.cwd = cwd;
      client.config.currentTeam = 'team_dummy';
      client.setArgv('integration', 'add', 'acme');
      const exitCodePromise = integrationCommand(client);
      await expect(client.stderr).toOutput(
        'Do you want to link this resource to the current project? (Y/n)'
      );
      client.stdin.write('n\n');
      await expect(exitCodePromise).resolves.toEqual(0);
      expect(openMock).toHaveBeenCalledWith(
        'https://vercel.com/api/marketplace/cli?teamId=team_dummy&integrationId=acme&productId=acme-product&cmd=add'
      );
    });

    it('should handle provisioning resource without project context', async () => {
      useUser();
      useTeams('team_dummy');
      useIntegration();
      client.config.currentTeam = 'team_dummy';
      client.setArgv('integration', 'add', 'acme');
      const exitCodePromise = integrationCommand(client);
      await expect(client.stderr).not.toOutput(
        'Do you want to link this resource to the current project? (Y/n)'
      );
      await expect(exitCodePromise).resolves.toEqual(0);
      expect(openMock).toHaveBeenCalledWith(
        'https://vercel.com/api/marketplace/cli?teamId=team_dummy&integrationId=acme&productId=acme-product&cmd=add'
      );
    });

    it('should return error when integration is not found', async () => {
      useUser();
      useTeams('team_dummy');
      useIntegration();
      const cwd = setupUnitFixture('vercel-integration-add');
      client.cwd = cwd;
      client.config.currentTeam = 'team_dummy';
      client.setArgv('integration', 'add', 'does-not-exist');
      const exitCodePromise = integrationCommand(client);
      await expect(client.stderr).toOutput(
        'Integration not found: does-not-exist'
      );
      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should return error when integration is not a marketplace integration', async () => {
      useUser();
      useTeams('team_dummy');
      useIntegration();
      const cwd = setupUnitFixture('vercel-integration-add');
      client.cwd = cwd;
      client.config.currentTeam = 'team_dummy';
      client.setArgv('integration', 'add', 'acme-external');
      const exitCodePromise = integrationCommand(client);
      await expect(client.stderr).toOutput(
        'Integration is not from the marketplace: Acme Integration External'
      );
      await expect(exitCodePromise).resolves.toEqual(1);
    });
  });
});
