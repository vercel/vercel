import open from 'open';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useProject } from '../../../mocks/project';
import { useTeams, createTeam } from '../../../mocks/team';
import openCommand from '../../../../src/commands/open';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';

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

  describe('--non-interactive', () => {
    it('outputs action_required JSON and exits when not linked (open uses ensureLink)', async () => {
      const cwd = setupTmpDir();
      useUser({ version: 'northstar' });
      useTeams('team_dummy');
      createTeam();
      client.cwd = cwd;
      client.setArgv('open', '--non-interactive');
      (client as { nonInteractive: boolean }).nonInteractive = true;

      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: number) => {
          throw new Error(`process.exit(${code})`);
        });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(openCommand(client)).rejects.toThrow('process.exit(1)');
      expect(logSpy).toHaveBeenCalled();
      const output = logSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('action_required');
      expect(output).toContain('missing_scope');

      exitSpy.mockRestore();
      logSpy.mockRestore();
      (client as { nonInteractive: boolean }).nonInteractive = false;
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

    it('accepts --yes and opens when linked', async () => {
      const { team } = await setupLinkedProject();

      client.setArgv('open', '--yes');
      const exitCode = await openCommand(client);

      expect(exitCode).toEqual(0);
      expect(openMock).toHaveBeenCalledWith(
        `https://vercel.com/${team.slug}/static-project`
      );
    });
  });

  describe('without linked project', () => {
    it('should error when project is not linked', async () => {
      const linkModule = await import('../../../../src/util/projects/link');
      const setupAndLinkModule = await import(
        '../../../../src/util/link/setup-and-link'
      );
      const getLinkedProjectSpy = vi
        .spyOn(linkModule, 'getLinkedProject')
        .mockResolvedValue({
          status: 'not_linked',
          org: null,
          project: null,
        });
      const setupAndLinkSpy = vi
        .spyOn(setupAndLinkModule, 'default')
        .mockResolvedValue({
          status: 'error',
          reason: 'HEADLESS',
          exitCode: 1,
        });

      const { setupTmpDir } = await import(
        '../../../helpers/setup-unit-fixture'
      );
      const cwd = setupTmpDir();
      client.cwd = cwd;
      useUser();
      (client as { nonInteractive: boolean }).nonInteractive = false;

      client.setArgv('open');
      const exitCode = await openCommand(client);

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain('requires confirmation');
      expect(client.stderr.getFullOutput()).toMatch(/--yes|yes/);
      expect(openMock).not.toHaveBeenCalled();

      getLinkedProjectSpy.mockRestore();
      setupAndLinkSpy.mockRestore();
      (client as { nonInteractive: boolean }).nonInteractive = false;
    });
  });
});
