import open from 'open';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import buy from '../../../../src/commands/buy';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';

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

describe('buy pro', () => {
  beforeEach(() => {
    openMock.mockClear();
  });

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
      const team = setupTeam();
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
      expect(openMock).toHaveBeenCalledWith(
        `https://vercel.com/${team.slug}/~/settings/billing`
      );
    });

    it('handles purchase_confirm_failed with 402 as payment error', async () => {
      const team = setupTeam();
      client.scenario.post('/v1/billing/buy', (_req, res) => {
        res.status(402).json({
          error: {
            code: 'purchase_confirm_failed',
            message: 'No default payment method set on this Customer',
          },
        });
      });
      client.setArgv('buy', 'pro', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput(
        'check that your team has a valid payment method'
      );
      expect(openMock).toHaveBeenCalledWith(
        `https://vercel.com/${team.slug}/~/settings/billing`
      );
    });

    it('handles purchase_create_failed with 402 as payment error', async () => {
      const team = setupTeam();
      client.scenario.post('/v1/billing/buy', (_req, res) => {
        res.status(402).json({
          error: {
            code: 'purchase_create_failed',
            message: 'No default payment method set on this Customer',
          },
        });
      });
      client.setArgv('buy', 'pro', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput(
        'check that your team has a valid payment method'
      );
      expect(openMock).toHaveBeenCalledWith(
        `https://vercel.com/${team.slug}/~/settings/billing`
      );
    });

    it('handles purchase_confirm_failed with non-402 as generic error', async () => {
      setupTeam();
      client.scenario.post('/v1/billing/buy', (_req, res) => {
        res.status(500).json({
          error: {
            code: 'purchase_confirm_failed',
            message: 'Internal error',
          },
        });
      });
      client.setArgv('buy', 'pro', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('try again later');
      expect(openMock).not.toHaveBeenCalled();
    });

    it('handles invalid_plan error', async () => {
      setupTeam();
      client.scenario.post('/v1/billing/buy', (_req, res) => {
        res.status(400).json({
          error: {
            code: 'invalid_plan',
            message: 'Team must be on Hobby plan',
          },
        });
      });
      client.setArgv('buy', 'pro', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('does not support this purchase');
    });

    it('handles already_on_plan error', async () => {
      setupTeam();
      client.scenario.post('/v1/billing/buy', (_req, res) => {
        res.status(400).json({
          error: {
            code: 'already_on_plan',
            message: 'Already on Pro',
          },
        });
      });
      client.setArgv('buy', 'pro', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput(
        'already has an active subscription'
      );
    });

    it('handles invalid_status error', async () => {
      setupTeam();
      client.scenario.post('/v1/billing/buy', (_req, res) => {
        res.status(400).json({
          error: {
            code: 'invalid_status',
            message: 'Team not upgradeable',
          },
        });
      });
      client.setArgv('buy', 'pro', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('not in a state');
    });

    it('handles forbidden error', async () => {
      setupTeam();
      client.scenario.post('/v1/billing/buy', (_req, res) => {
        res.status(403).json({
          error: {
            code: 'forbidden',
            message: 'Cannot create subscription for this team',
          },
        });
      });
      client.setArgv('buy', 'pro', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('do not have permission');
    });

    it('handles purchase_create_hosted_failed as generic purchase error', async () => {
      setupTeam();
      client.scenario.post('/v1/billing/buy', (_req, res) => {
        res.status(500).json({
          error: {
            code: 'purchase_create_hosted_failed',
            message: 'Failed to create hosted checkout',
          },
        });
      });
      client.setArgv('buy', 'pro', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('try again later');
      expect(openMock).not.toHaveBeenCalled();
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
      client.setArgv('buy', 'pro', '--yes');
      const exitCode = await buy(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Payment failed');
      expect(openMock).toHaveBeenCalledWith(
        `https://vercel.com/${team.slug}/~/settings/billing`
      );
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
