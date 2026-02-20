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
      setupTeam();
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
    });

    it('handles payment_failed error', async () => {
      setupTeam();
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

  describe('--format=json', () => {
    it('outputs JSON on success', async () => {
      setupTeam();
      useBuyEndpoint();
      client.setArgv('buy', 'addon', 'siem', '1', '--yes', '--format=json');
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
