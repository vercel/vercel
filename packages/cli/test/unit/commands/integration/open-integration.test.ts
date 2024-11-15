import { beforeEach, describe, expect, it, vi } from 'vitest';
import open from 'open';
import integrationCommand from '../../../../src/commands/integration';
import { client } from '../../../mocks/client';
import { useConfiguration } from '../../../mocks/integration';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

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
  describe('open', () => {
    describe('--help', () => {
      it('tracks telemetry', async () => {
        const command = 'integration';
        const subcommand = 'open';

        client.setArgv(command, subcommand, '--help');
        const exitCodePromise = integrationCommand(client);
        await expect(exitCodePromise).resolves.toEqual(2);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'flag:help',
            value: `${command}:${subcommand}`,
          },
        ]);
      });
    });

    it('should track subcommand usage', async () => {
      client.setArgv('integration', 'open');
      const exitCode = await integrationCommand(client);
      expect(exitCode, 'exit code for "integrationCommand"').toEqual(1);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:open',
          value: 'open',
        },
      ]);
    });

    describe('[name]', () => {
      beforeEach(() => {
        useUser();
      });

      describe('found integrations', () => {
        const teamId = 'team_dummy';

        beforeEach(() => {
          const teams = useTeams(teamId);
          const team = Array.isArray(teams) ? teams[0] : teams.teams[0];
          client.config.currentTeam = team.id;

          useConfiguration();
        });

        it('should open dashboard for user with the configuration ID and team ID', async () => {
          useProject({
            ...defaultProject,
            id: 'vercel-integration-open',
            name: 'vercel-integration-open',
          });
          client.setArgv('integration', 'open', 'acme');
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integration"').toEqual(0);
          await expect(client.stderr).toOutput('Opening the acme dashboard...');
          expect(openMock).toHaveBeenCalledWith(
            'https://vercel.com/api/marketplace/sso?teamId=team_dummy&integrationConfigurationId=acme-1'
          );
        });

        it("should open dashboard for user with the first returned configuration's ID when multiple are returned", async () => {
          useProject({
            ...defaultProject,
            id: 'vercel-integration-open',
            name: 'vercel-integration-open',
          });
          client.setArgv('integration', 'open', 'acme-two-configurations');
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integration"').toEqual(0);
          await expect(client.stderr).toOutput(
            'Opening the acme-two-configurations dashboard...'
          );
          expect(openMock).toHaveBeenCalledWith(
            'https://vercel.com/api/marketplace/sso?teamId=team_dummy&integrationConfigurationId=acme-first'
          );
        });

        it('should track the [name] positional argument with known integration slug', async () => {
          useProject({
            ...defaultProject,
            id: 'vercel-integration-open',
            name: 'vercel-integration-open',
          });
          client.setArgv('integration', 'open', 'acme');
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integrationCommand"').toEqual(0);

          expect(client.telemetryEventStore).toHaveTelemetryEvents([
            {
              key: 'subcommand:open',
              value: 'open',
            },
            {
              key: 'argument:name',
              value: 'acme',
            },
          ]);
        });
      });

      describe('errors', () => {
        it('should error when no integration arugment is passed', async () => {
          client.setArgv('integration', 'open');
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integration"').toEqual(1);
          await expect(client.stderr).toOutput(
            'Error: You must pass an integration slug'
          );
        });

        it('should error when more than one integration arugment is passed', async () => {
          client.setArgv('integration', 'open', 'acme', 'foobar');
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integration"').toEqual(1);
          await expect(client.stderr).toOutput(
            'Error: Cannot open more than one dashboard at a time'
          );
        });

        it('should error when no team is present', async () => {
          client.setArgv('integration', 'open', 'acme');
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integration"').toEqual(1);
          await expect(client.stderr).toOutput('Error: Team not found');
        });

        it('should error when no configuration exists for the provided slug', async () => {
          const teams = useTeams('team_dummy');
          const team = Array.isArray(teams) ? teams[0] : teams.teams[0];
          client.config.currentTeam = team.id;
          useConfiguration();

          client.setArgv('integration', 'open', 'acme-no-results');
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integration"').toEqual(1);
          await expect(client.stderr).toOutput(
            'Error: No configuration found for "acme-no-results".'
          );
        });

        it('should track the [name] positional argument with unknown integration slug', async () => {
          const teams = useTeams('team_dummy');
          const team = Array.isArray(teams) ? teams[0] : teams.teams[0];
          client.config.currentTeam = team.id;
          useConfiguration();

          client.setArgv('integration', 'open', 'acme-no-results');
          const exitCode = await integrationCommand(client);
          expect(exitCode, 'exit code for "integrationCommand"').toEqual(1);

          expect(client.telemetryEventStore).toHaveTelemetryEvents([
            {
              key: 'subcommand:open',
              value: 'open',
            },
            {
              key: 'argument:name',
              value: '[REDACTED]',
            },
          ]);
        });

        it('should error when the configurations API responds erroneously', async () => {
          const teams = useTeams('team_dummy');
          const team = Array.isArray(teams) ? teams[0] : teams.teams[0];
          client.config.currentTeam = team.id;
          useConfiguration();

          client.setArgv('integration', 'open', 'error');
          const exitCodePromise = integrationCommand(client);
          await expect(client.stderr).toOutput(
            'Error: Failed to fetch configuration for "error": Response Error (500)',
            20000
          );
          const exitCode = await exitCodePromise;
          expect(exitCode, 'exit code for "integration"').toEqual(1);
        });
      });
    });
  });
});
