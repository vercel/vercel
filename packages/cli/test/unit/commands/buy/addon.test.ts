import open from 'open';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import buy from '../../../../src/commands/buy';
import { useUser } from '../../../mocks/user';
import { useTeam, useTeams } from '../../../mocks/team';
import { defaultProject, useProject } from '../../../mocks/project';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

vi.mock('open', () => {
  return {
    default: vi.fn().mockResolvedValue(undefined),
  };
});

const openMock = vi.mocked(open);

function useBuyEndpoint(handler?: (req: any, res: any) => void) {
  client.scenario.post('/v1/billing/buy', (req, res) => {
    if (handler) {
      handler(req, res);
    } else {
      res.json({
        subscriptionIntent: {
          id: 'subint_test_123',
          status: 'succeeded',
        },
      });
    }
  });
}

function setupTeam() {
  useUser();
  const team = useTeam();
  client.config.currentTeam = team.id;
  return team;
}

describe('buy addon', () => {
  beforeEach(() => {
    openMock.mockClear();
  });

  describe('validation', () => {
    it('errors when addon name is missing', async () => {
      client.setArgv('buy', 'addon');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Missing addon name');
    });

    it('errors when addon name is invalid', async () => {
      client.setArgv('buy', 'addon', 'invalid', '1');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Invalid addon "invalid"');
    });

    it('errors when quantity is missing', async () => {
      client.setArgv('buy', 'addon', 'siem');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Missing quantity');
    });

    it('errors when customEnvironment packs are missing', async () => {
      setupTeam();
      client.setArgv('buy', 'addon', 'customEnvironment');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Missing packs');
    });

    it('purchases customEnvironment packs for the linked project', async () => {
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

      client.setArgv('buy', 'addon', 'customEnvironment', '2', '--yes');
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
      await expect(client.stderr).toOutput('customEnvironment');
    });

    it('errors when quantity is not a number', async () => {
      client.setArgv('buy', 'addon', 'siem', 'abc');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Invalid quantity "abc"');
    });

    it('errors when quantity is zero', async () => {
      client.setArgv('buy', 'addon', 'siem', '0');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('positive number');
    });

    it('errors when quantity is negative', async () => {
      client.setArgv('buy', 'addon', 'siem', '-1');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('unknown or unexpected option');
    });

    it('errors when quantity is a decimal', async () => {
      client.setArgv('buy', 'addon', 'siem', '1.5');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Invalid quantity "1.5"');
    });
  });

  describe('--yes', () => {
    it('skips confirmation and purchases successfully', async () => {
      setupTeam();
      useBuyEndpoint();
      client.setArgv('buy', 'addon', 'siem', '1', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(0);
    });

    it('errors in non-TTY mode without --yes', async () => {
      setupTeam();
      useBuyEndpoint();
      client.setArgv('buy', 'addon', 'siem', '1');
      (client.stdin as any).isTTY = false;

      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Use --yes');
    });
  });

  describe('confirmation prompt', () => {
    it('aborts when user declines', async () => {
      setupTeam();
      useBuyEndpoint();
      client.setArgv('buy', 'addon', 'siem', '1');

      const exitCodePromise = buy(client);
      await expect(client.stderr).toOutput('Purchase');
      client.stdin.write('n\n');

      expect(await exitCodePromise).toBe(0);
    });

    it('proceeds when user confirms', async () => {
      setupTeam();
      useBuyEndpoint();
      client.setArgv('buy', 'addon', 'siem', '1');

      const exitCodePromise = buy(client);
      await expect(client.stderr).toOutput('Purchase');
      client.stdin.write('y\n');

      expect(await exitCodePromise).toBe(0);
    });
  });

  describe('API errors', () => {
    it('handles missing_stripe_customer error', async () => {
      const team = setupTeam();
      client.scenario.post('/v1/billing/buy', (_req, res) => {
        res.status(400).json({
          error: {
            code: 'missing_stripe_customer',
            message: 'No payment method',
          },
        });
      });
      client.setArgv('buy', 'addon', 'siem', '1', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('payment method');
      expect(openMock).toHaveBeenCalledWith(
        `https://vercel.com/${team.slug}/~/settings/billing`
      );
    });

    it('handles payment_failed error', async () => {
      const team = setupTeam();
      client.scenario.post('/v1/billing/buy', (_req, res) => {
        res.status(402).json({
          error: {
            code: 'payment_failed',
            message: 'Payment failed',
          },
        });
      });
      client.setArgv('buy', 'addon', 'siem', '1', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Payment failed');
      expect(openMock).toHaveBeenCalledWith(
        `https://vercel.com/${team.slug}/~/settings/billing`
      );
    });

    it('handles invalid_plan_iteration error', async () => {
      setupTeam();
      client.scenario.post('/v1/billing/buy', (_req, res) => {
        res.status(400).json({
          error: {
            code: 'invalid_plan_iteration',
            message: 'Team must be on flex plan',
          },
        });
      });
      client.setArgv('buy', 'addon', 'siem', '1', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Flex plan');
    });

    it('handles missing_subscription error', async () => {
      setupTeam();
      client.scenario.post('/v1/billing/buy', (_req, res) => {
        res.status(400).json({
          error: {
            code: 'missing_subscription',
            message: 'No subscription found',
          },
        });
      });
      client.setArgv('buy', 'addon', 'siem', '1', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('active subscription');
    });
  });

  describe('--json', () => {
    it('outputs JSON on success', async () => {
      setupTeam();
      useBuyEndpoint();
      client.setArgv('buy', 'addon', 'siem', '1', '--yes', '--json');
      const exitCode = await buy(client);
      expect(exitCode).toBe(0);

      const stdoutOutput = client.stdout.getFullOutput();
      const parsed = JSON.parse(stdoutOutput);
      expect(parsed.productAlias).toBe('siem');
      expect(parsed.quantity).toBe(1);
      expect(parsed.subscriptionIntent.id).toBe('subint_test_123');
    });
  });

  describe('--help', () => {
    it('shows help and returns 2', async () => {
      client.setArgv('buy', 'addon', '--help');
      const exitCode = await buy(client);
      expect(exitCode).toBe(2);
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
      useBuyEndpoint();
      client.setArgv('buy', 'addon', 'siem', '1', '--yes');
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
