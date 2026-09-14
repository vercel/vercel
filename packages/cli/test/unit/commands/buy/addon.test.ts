import { describe, it, expect } from 'vitest';
import { client } from '../../../mocks/client';
import buy from '../../../../src/commands/buy';
import { useUser } from '../../../mocks/user';
import { useTeam, useTeams } from '../../../mocks/team';
import { defaultProject, useProject } from '../../../mocks/project';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

function useObservabilityPlusEndpoint(
  handler?: (req: any, res: any) => void,
  configurationHandler?: (req: any, res: any) => void
) {
  client.scenario.get('/v1/observability/manage/configuration', (req, res) => {
    if (configurationHandler) {
      configurationHandler(req, res);
    } else {
      res.json({
        observabilityPlus: { enabled: false, subscribed: false },
      });
    }
  });
  client.scenario.patch(
    '/v1/observability/manage/configuration',
    (req, res) => {
      if (handler) {
        handler(req, res);
      } else {
        res.json({ teamEnabled: true });
      }
    }
  );
}

function setupTeam() {
  useUser();
  const team = useTeam();
  client.config.currentTeam = team.id;
  return team;
}

describe('buy addon', () => {
  describe('validation', () => {
    it('errors when addon name is missing', async () => {
      client.setArgv('buy', 'addon');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Missing addon name');
      expect(stderr).toContain('custom-environment, observability-plus');
      expect(stderr).not.toContain('customEnvironment');
      expect(stderr).not.toContain('observabilityPlus');
    });

    it('errors when addon name is invalid', async () => {
      client.setArgv('buy', 'addon', 'invalid', '1');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Invalid addon "invalid"');
    });

    it('errors when custom environment packs are missing', async () => {
      client.setArgv('buy', 'addon', 'custom-environment');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Missing packs');
      expect(stderr).toContain('buy addon custom-environment 2');
      expect(stderr).not.toContain('customEnvironment');
    });

    it('purchases custom environment packs using the kebab-case name', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'static',
        id: 'static',
      });
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.scenario.get(
        `/v1/projects/custom-environments/settings`,
        (_req, res) => {
          res.json({
            packSize: 5,
            baseline: 1,
            purchasedAmount: 0,
            minPurchasedAmount: 0,
            maxPurchasedAmount: 15,
            effectiveLimit: 1,
            environmentsUsed: 1,
          });
        }
      );
      client.scenario.post(
        `/v1/projects/custom-environments/settings`,
        (req, res) => {
          const body =
            typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
          res.json({ purchasedAmount: body.purchasedAmount });
        }
      );

      client.setArgv('buy', 'addon', 'custom-environment', '2', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(0);
      await expect(client.stderr).toOutput(
        'Updated custom environment capacity'
      );
    });

    it('rejects over-limit customEnvironment purchases with a clear message', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'static',
        id: 'static',
      });
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.scenario.get(
        `/v1/projects/custom-environments/settings`,
        (_req, res) => {
          res.json({
            packSize: 5,
            baseline: 1,
            purchasedAmount: 0,
            minPurchasedAmount: 0,
            maxPurchasedAmount: 15,
            effectiveLimit: 1,
            environmentsUsed: 1,
          });
        }
      );

      client.setArgv('buy', 'addon', 'customEnvironment', '1500', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput(
        'Packs must be between 0 and 3 for this project (0-15 purchased environments)'
      );
    });

    it('shows Pro upsell when hobby team purchases via legacy buy addon', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'static',
        id: 'static',
      });
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.scenario.get(
        `/v1/projects/custom-environments/settings`,
        (_req, res) => {
          res.json({
            packSize: 5,
            baseline: 1,
            purchasedAmount: 0,
            minPurchasedAmount: 0,
            maxPurchasedAmount: 15,
            effectiveLimit: 1,
            environmentsUsed: 1,
          });
        }
      );
      client.scenario.post(
        `/v1/projects/custom-environments/settings`,
        (_req, res) => {
          res.status(403).json({
            error: {
              code: 'upgrade_required',
              message:
                'You must be on an active Pro or Enterprise plan to purchase custom environments.',
            },
          });
        }
      );

      client.setArgv('buy', 'addon', 'customEnvironment', '1', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Pro or Enterprise');
      await expect(client.stderr).toOutput('buy pro');
    });

    it('supports the add-on subcommand alias', async () => {
      client.setArgv('buy', 'add-on', '--help');
      const exitCode = await buy(client);
      expect(exitCode).toBe(2);
      await expect(client.stderr).toOutput('custom-environment');
    });
  });

  describe('Observability Plus', () => {
    it('rejects --project because Observability Plus is team-scoped', async () => {
      setupTeam();
      client.setArgv(
        'buy',
        'addon',
        'observabilityPlus',
        '--project',
        'project-on-another-team',
        '--yes'
      );

      expect(await buy(client)).toBe(1);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        "--project isn't supported for Observability Plus"
      );
      expect(stderr).toContain('Use --scope <team>');
    });

    it('enables Observability Plus through the configuration endpoint', async () => {
      const team = setupTeam();
      useObservabilityPlusEndpoint((req, res) => {
        const body =
          typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        expect(body).toEqual({ teamEnabled: true });
        res.json({ teamEnabled: true });
      });

      client.setArgv('buy', 'addon', 'observability-plus', '--yes');
      const exitCode = await buy(client);
      const stderr = client.stderr.getFullOutput();

      expect(exitCode).toBe(0);
      expect(stderr).toContain('Enabled');
      expect(stderr).toContain('Observability Plus');
      expect(stderr).toContain(team.slug);
      expect(stderr).toContain('Billed as accrued');
      expect(stderr).not.toContain('Base fee');
    });

    it.each([
      'observability',
      'observabilityPlus',
      'observability_plus',
    ])('accepts the %s alias', async alias => {
      setupTeam();
      useObservabilityPlusEndpoint();
      client.setArgv('buy', 'addon', alias, '--yes');

      expect(await buy(client)).toBe(0);
    });

    it('shows the resolved team before confirmation', async () => {
      const team = setupTeam();
      useObservabilityPlusEndpoint();
      client.setArgv('buy', 'addon', 'observabilityPlus');

      const exitCodePromise = buy(client);
      await expect(client.stderr).toOutput('Add-on');
      await expect(client.stderr).toOutput(team.slug);
      await expect(client.stderr).toOutput('Enable this add-on?');
      client.stdin.write('y\n');

      expect(await exitCodePromise).toBe(0);
    });

    it('does not prompt in non-TTY mode', async () => {
      setupTeam();
      useObservabilityPlusEndpoint();
      client.setArgv('buy', 'addon', 'observabilityPlus');
      (client.stdin as any).isTTY = false;

      const exitCode = await buy(client);

      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Use --yes');
    });

    it('does not prompt in non-interactive mode', async () => {
      setupTeam();
      useObservabilityPlusEndpoint();
      client.nonInteractive = true;
      client.setArgv('buy', 'addon', 'observabilityPlus');

      const exitCode = await buy(client);

      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Use --yes');
    });

    it('routes Hobby teams to a Pro upgrade', async () => {
      const team = setupTeam();
      (team as any).billing = { plan: 'hobby' };
      client.setArgv('buy', 'addon', 'observabilityPlus', '--yes');

      const exitCode = await buy(client);

      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput(
        'requires an active Pro or Enterprise plan'
      );
      await expect(client.stderr).toOutput('buy pro');
    });

    it('fails when the API does not confirm access', async () => {
      setupTeam();
      useObservabilityPlusEndpoint((_req, res) => {
        res.json({ teamEnabled: false });
      });
      client.setArgv('buy', 'addon', 'observabilityPlus', '--yes');

      const exitCode = await buy(client);

      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput(
        'did not confirm Observability Plus access'
      );
    });

    it('explains the owner permission requirement', async () => {
      setupTeam();
      useObservabilityPlusEndpoint((_req, res) => {
        res.status(403).json({
          error: {
            code: 'forbidden',
            message: 'Not authorized',
          },
        });
      });
      client.setArgv('buy', 'addon', 'observabilityPlus', '--yes');

      const exitCode = await buy(client);

      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput(
        'Only team owners can purchase Observability Plus'
      );
    });

    it('reports an already-enabled team', async () => {
      const team = setupTeam();
      useObservabilityPlusEndpoint(undefined, (_req, res) => {
        res.json({
          observabilityPlus: { enabled: true, subscribed: true },
        });
      });
      client.setArgv('buy', 'addon', 'observabilityPlus', '--yes');

      expect(await buy(client)).toBe(0);
      await expect(client.stderr).toOutput('Already enabled');
      await expect(client.stderr).toOutput(team.slug);
    });

    it('outputs JSON on success', async () => {
      const team = setupTeam();
      useObservabilityPlusEndpoint();
      client.setArgv('buy', 'addon', 'observabilityPlus', '--yes', '--json');

      const exitCode = await buy(client);
      const stdout = client.stdout.getFullOutput();
      const stderr = client.stderr.getFullOutput();
      const parsed = JSON.parse(stdout);

      expect(exitCode).toBe(0);
      expect(parsed).toEqual({
        productAlias: 'observabilityPlus',
        quantity: 1,
        team: team.slug,
        teamEnabled: true,
      });
      expect(stdout).not.toContain('Checking Observability Plus status');
      expect(stdout).not.toContain('Enabling Observability Plus');
      expect(stderr).not.toContain('Checking Observability Plus status');
      expect(stderr).not.toContain('Enabling Observability Plus');
    });
  });

  describe('--help', () => {
    it('shows help and returns 2', async () => {
      client.setArgv('buy', 'addon', '--help');
      const exitCode = await buy(client);
      const stderr = client.stderr.getFullOutput();

      expect(exitCode).toBe(2);
      expect(stderr).toContain('custom-environment');
      expect(stderr).toContain('observability-plus');
      expect(stderr).not.toContain('customEnvironment');
      expect(stderr).not.toContain('observabilityPlus');
    });

    it('tracks telemetry', async () => {
      client.setArgv('buy', 'addon', '--help');
      await buy(client);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'buy:addon',
        },
      ]);
    });
  });

  describe('telemetry', () => {
    it('tracks addon subcommand', async () => {
      setupTeam();
      useObservabilityPlusEndpoint();
      client.setArgv('buy', 'addon', 'observabilityPlus', '--yes');
      await buy(client);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:addon',
          value: 'addon',
        },
      ]);
    });
  });
});
