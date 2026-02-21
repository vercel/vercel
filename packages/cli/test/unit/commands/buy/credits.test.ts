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

describe('buy credits', () => {
  describe('validation', () => {
    it('errors when credit type is missing', async () => {
      client.setArgv('buy', 'credits');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Missing credit type');
    });

    it('errors when credit type is invalid', async () => {
      client.setArgv('buy', 'credits', 'invalid', '100');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Invalid credit type "invalid"');
    });

    it('errors when amount is missing', async () => {
      client.setArgv('buy', 'credits', 'v0');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Missing amount');
    });

    it('errors when amount is not a number', async () => {
      client.setArgv('buy', 'credits', 'v0', 'abc');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Invalid amount "abc"');
    });

    it('errors when amount has trailing garbage', async () => {
      client.setArgv('buy', 'credits', 'v0', '50abc');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Invalid amount "50abc"');
    });

    it('errors when amount is zero', async () => {
      client.setArgv('buy', 'credits', 'v0', '0');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('positive amount');
    });

    it('errors when amount is negative', async () => {
      // Negative numbers are parsed as flags by the arg parser,
      // so this results in an "unknown option" error
      client.setArgv('buy', 'credits', 'v0', '-10');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('unknown or unexpected option');
    });

    it('errors when amount exceeds $1,000', async () => {
      setupTeam();
      client.setArgv('buy', 'credits', 'v0', '1001');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('cannot exceed');
    });

    it('errors when amount is a decimal', async () => {
      client.setArgv('buy', 'credits', 'v0', '50.5');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Invalid amount "50.5"');
    });
  });

  describe('--yes', () => {
    it('skips confirmation and purchases successfully', async () => {
      setupTeam();
      useBuyEndpoint();
      client.setArgv('buy', 'credits', 'v0', '100', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(0);
    });

    it('errors in non-TTY mode without --yes', async () => {
      setupTeam();
      useBuyEndpoint();
      client.setArgv('buy', 'credits', 'v0', '100');
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
      client.setArgv('buy', 'credits', 'v0', '100');

      const exitCodePromise = buy(client);
      await expect(client.stderr).toOutput('Purchase');
      client.stdin.write('n\n');

      expect(await exitCodePromise).toBe(0);
    });

    it('proceeds when user confirms', async () => {
      setupTeam();
      useBuyEndpoint();
      client.setArgv('buy', 'credits', 'v0', '100');

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
      client.setArgv('buy', 'credits', 'v0', '100', '--yes');
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
      client.setArgv('buy', 'credits', 'v0', '100', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Payment failed');
    });
  });

  describe('--format=json', () => {
    it('outputs JSON on success', async () => {
      setupTeam();
      useBuyEndpoint();
      client.setArgv('buy', 'credits', 'v0', '100', '--yes', '--format=json');
      const exitCode = await buy(client);
      expect(exitCode).toBe(0);

      const stdoutOutput = client.stdout.getFullOutput();
      const parsed = JSON.parse(stdoutOutput);
      expect(parsed.creditType).toBe('v0');
      expect(parsed.amount).toBe(100);
      expect(parsed.purchaseIntent.id).toBe('pi_test_123');
    });
  });

  describe('--help', () => {
    it('shows help and returns 2', async () => {
      client.setArgv('buy', 'credits', '--help');
      const exitCode = await buy(client);
      expect(exitCode).toBe(2);
    });

    it('tracks telemetry', async () => {
      client.setArgv('buy', 'credits', '--help');
      await buy(client);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'buy:credits',
        },
      ]);
    });
  });

  describe('telemetry', () => {
    it('tracks credits subcommand', async () => {
      setupTeam();
      useBuyEndpoint();
      client.setArgv('buy', 'credits', 'v0', '100', '--yes');
      await buy(client);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:credits',
          value: 'credits',
        },
      ]);
    });
  });
});
