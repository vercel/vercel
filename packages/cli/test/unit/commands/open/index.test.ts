import open from 'open';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import openCommand from '../../../../src/commands/open';

vi.mock('open', () => {
  return {
    default: vi.fn(),
  };
});

const openMock = vi.mocked(open);

describe('open', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    openMock.mockResolvedValue(undefined as any);
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'open';

      client.setArgv(command, '--help');
      const exitCodePromise = openCommand(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });

    it('prints help message', async () => {
      client.setArgv('open', '--help');
      const exitCode = await openCommand(client);
      expect(exitCode).toEqual(0);
      expect(client.getFullOutput()).toContain(
        'Opens the current project in the Vercel Dashboard'
      );
    });
  });

  describe('with linked project', () => {
    const setupLinkedProject = async () => {
      const { setupUnitFixture } = await import(
        '../../../helpers/setup-unit-fixture'
      );
      const cwd = setupUnitFixture('commands/deploy/static');
      client.cwd = cwd;

      const user = useUser();
      const teams = useTeams('team_dummy', { apiVersion: 1 });
      const team = Array.isArray(teams) ? teams[0] : teams.teams[0];
      useProject({
        id: 'static',
        name: 'static-project',
      });

      return { user, cwd, team };
    };

    it('opens the project dashboard URL', async () => {
      const { team } = await setupLinkedProject();

      client.setArgv('open');
      const exitCode = await openCommand(client);

      expect(exitCode).toEqual(0);
      expect(openMock).toHaveBeenCalledWith(
        `https://vercel.com/${team.slug}/static-project`
      );
      await expect(client.stderr).toOutput(
        `Opening https://vercel.com/${team.slug}/static-project in your browser...`
      );
    });
  });

  describe('without linked project', () => {
    it('should error when project is not linked', async () => {
      const { setupTmpDir } = await import(
        '../../../helpers/setup-unit-fixture'
      );
      const cwd = setupTmpDir();
      client.cwd = cwd;

      useUser();

      client.setArgv('open');
      const exitCode = await openCommand(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'This command requires a linked project. Please run:'
      );
      await expect(client.stderr).toOutput('  vercel link');
      expect(openMock).not.toHaveBeenCalled();
    });
  });
});
