import { describe, it, expect } from 'vitest';
import { client } from '../../../mocks/client';
import buy from '../../../../src/commands/buy';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';

function useBuyEndpoint(handler?: (req: any, res: any) => void) {
  client.scenario.post('/v1/billing/buy', (req, res) => {
    if (handler) {
      handler(req, res);
    } else {
      res.json({
        purchaseIntent: {
          id: 'pi_test_123',
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

describe('buy v0', () => {
  describe('validation', () => {
    it('errors when plan is missing', async () => {
      client.setArgv('buy', 'v0');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Missing plan');
    });

    it('errors when plan is invalid', async () => {
      client.setArgv('buy', 'v0', 'invalid');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Invalid plan "invalid"');
    });
  });

  describe('--yes', () => {
    it('skips confirmation and purchases premium successfully', async () => {
      setupTeam();
      useBuyEndpoint();
      client.setArgv('buy', 'v0', 'premium', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(0);
    });

    it('skips confirmation and purchases free successfully', async () => {
      setupTeam();
      useBuyEndpoint();
      client.setArgv('buy', 'v0', 'free', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(0);
    });

    it('skips confirmation and purchases team successfully', async () => {
      setupTeam();
      useBuyEndpoint();
      client.setArgv('buy', 'v0', 'team', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(0);
    });

    it('errors in non-TTY mode without --yes', async () => {
      setupTeam();
      useBuyEndpoint();
      client.setArgv('buy', 'v0', 'premium');
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
      client.setArgv('buy', 'v0', 'premium');

      const exitCodePromise = buy(client);
      await expect(client.stderr).toOutput('Purchase');
      client.stdin.write('n\n');

      expect(await exitCodePromise).toBe(0);
    });

    it('proceeds when user confirms', async () => {
      setupTeam();
      useBuyEndpoint();
      client.setArgv('buy', 'v0', 'premium');

      const exitCodePromise = buy(client);
      await expect(client.stderr).toOutput('Purchase');
      client.stdin.write('y\n');

      expect(await exitCodePromise).toBe(0);
    });
  });

  describe('API errors', () => {
    it('handles missing_stripe_customer error', async () => {
      setupTeam();
      client.scenario.post('/v1/billing/buy', (_req, res) => {
        res.status(400).json({
          error: {
            code: 'missing_stripe_customer',
            message: 'No payment method',
          },
        });
      });
      client.setArgv('buy', 'v0', 'premium', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('payment method');
    });

    it('handles has_subscription error', async () => {
      setupTeam();
      client.scenario.post('/v1/billing/buy', (_req, res) => {
        res.status(400).json({
          error: {
            code: 'has_subscription',
            message: 'Team already has an active v0 subscription',
          },
        });
      });
      client.setArgv('buy', 'v0', 'premium', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('active v0 subscription');
    });

    it('handles invalid_plan error', async () => {
      setupTeam();
      client.scenario.post('/v1/billing/buy', (_req, res) => {
        res.status(400).json({
          error: {
            code: 'invalid_plan',
            message: 'Enterprise teams cannot purchase v0 subscriptions',
          },
        });
      });
      client.setArgv('buy', 'v0', 'premium', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Enterprise teams cannot purchase');
    });

    it('handles plan_not_found error', async () => {
      setupTeam();
      client.scenario.post('/v1/billing/buy', (_req, res) => {
        res.status(400).json({
          error: {
            code: 'plan_not_found',
            message: 'No v0 plan found',
          },
        });
      });
      client.setArgv('buy', 'v0', 'premium', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('plan was not found');
    });
  });

  describe('--format=json', () => {
    it('outputs JSON on success', async () => {
      setupTeam();
      useBuyEndpoint();
      client.setArgv('buy', 'v0', 'premium', '--yes', '--format=json');
      const exitCode = await buy(client);
      expect(exitCode).toBe(0);

      const stdoutOutput = client.stdout.getFullOutput();
      const parsed = JSON.parse(stdoutOutput);
      expect(parsed.plan).toBe('premium');
      expect(parsed.planSlug).toBe('v0-premium');
      expect(parsed.purchaseIntent.id).toBe('pi_test_123');
    });
  });

  describe('--help', () => {
    it('shows help and returns 2', async () => {
      client.setArgv('buy', 'v0', '--help');
      const exitCode = await buy(client);
      expect(exitCode).toBe(2);
    });

    it('tracks telemetry', async () => {
      client.setArgv('buy', 'v0', '--help');
      await buy(client);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'buy:v0',
        },
      ]);
    });
  });

  describe('telemetry', () => {
    it('tracks v0 subcommand', async () => {
      setupTeam();
      useBuyEndpoint();
      client.setArgv('buy', 'v0', 'premium', '--yes');
      await buy(client);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:v0',
          value: 'v0',
        },
      ]);
    });
  });
});
