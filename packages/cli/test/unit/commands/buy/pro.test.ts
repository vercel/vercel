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

describe('buy pro', () => {
  describe('--yes', () => {
    it('skips confirmation and purchases successfully', async () => {
      setupTeam();
      useBuyEndpoint();
      client.setArgv('buy', 'pro', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(0);
    });

    it('errors in non-TTY mode without --yes', async () => {
      setupTeam();
      useBuyEndpoint();
      client.setArgv('buy', 'pro');
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
      client.setArgv('buy', 'pro');

      const exitCodePromise = buy(client);
      await expect(client.stderr).toOutput('Upgrade team');
      client.stdin.write('n\n');

      expect(await exitCodePromise).toBe(0);
    });

    it('proceeds when user confirms', async () => {
      setupTeam();
      useBuyEndpoint();
      client.setArgv('buy', 'pro');

      const exitCodePromise = buy(client);
      await expect(client.stderr).toOutput('Upgrade team');
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
      client.setArgv('buy', 'pro', '--yes');
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
      client.setArgv('buy', 'pro', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Payment failed');
    });
  });

  describe('--format=json', () => {
    it('outputs JSON on success', async () => {
      setupTeam();
      useBuyEndpoint();
      client.setArgv('buy', 'pro', '--yes', '--format=json');
      const exitCode = await buy(client);
      expect(exitCode).toBe(0);

      const stdoutOutput = client.stdout.getFullOutput();
      const parsed = JSON.parse(stdoutOutput);
      expect(parsed.team).toBeDefined();
      expect(parsed.subscriptionIntent.id).toBe('subint_test_123');
    });
  });

  describe('--help', () => {
    it('shows help and returns 2', async () => {
      client.setArgv('buy', 'pro', '--help');
      const exitCode = await buy(client);
      expect(exitCode).toBe(2);
    });

    it('tracks telemetry', async () => {
      client.setArgv('buy', 'pro', '--help');
      await buy(client);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'buy:pro',
        },
      ]);
    });
  });

  describe('telemetry', () => {
    it('tracks pro subcommand', async () => {
      setupTeam();
      useBuyEndpoint();
      client.setArgv('buy', 'pro', '--yes');
      await buy(client);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:pro',
          value: 'pro',
        },
      ]);
    });
  });
});
