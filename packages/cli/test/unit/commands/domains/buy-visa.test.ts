import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import domains from '../../../../src/commands/domains';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';

function mockPurchaseRoutes(onBuy: (body: unknown) => void) {
  client.scenario.get(
    '/v1/registrar/domains/example.com/price',
    (_req, res) => {
      res.json({
        purchasePrice: 100,
        renewalPrice: 100,
        transferPrice: null,
        years: 1,
      });
    }
  );

  client.scenario.get(
    '/v1/registrar/domains/example.com/availability',
    (_req, res) => {
      res.json({ available: true });
    }
  );

  client.scenario.post('/v1/registrar/domains/example.com/buy', (req, res) => {
    onBuy(req.body);
    res.json({ orderId: 'ord_test123' });
  });

  client.scenario.get('/v1/registrar/orders/ord_test123', (_req, res) => {
    res.json({
      orderId: 'ord_test123',
      status: 'completed',
      domains: [{ domainName: 'example.com', status: 'completed' }],
    });
  });

  client.scenario.get('/v5/domains/example.com', (_req, res) => {
    res.json({
      domain: {
        id: 'dmn_test',
        name: 'example.com',
        serviceType: 'external',
        boughtAt: Date.now(),
        createdAt: Date.now(),
        expiresAt: null,
        transferStartedAt: null,
        transferredAt: null,
        orderedAt: Date.now(),
        renew: true,
        creator: {
          id: 'usr_test',
          username: 'test-user',
          email: 'test@example.com',
        },
      },
    });
  });
}

async function answerPurchasePrompts() {
  await expect(client.stderr).toOutput('Buy now for $100 (1yr)?');
  client.stdin.write('y\n');

  await expect(client.stderr).toOutput('Auto renew yearly');
  client.stdin.write('y\n');

  await expect(client.stderr).toOutput('First name:');
  client.stdin.write('Jane\n');
  await expect(client.stderr).toOutput('Last name:');
  client.stdin.write('Doe\n');
  await expect(client.stderr).toOutput('Email:');
  client.stdin.write('jane@example.com\n');
  await expect(client.stderr).toOutput('Phone');
  client.stdin.write('+15551234567\n');
  await expect(client.stderr).toOutput('Address:');
  client.stdin.write('123 Main St\n');
  await expect(client.stderr).toOutput('City:');
  client.stdin.write('Anytown\n');
  await expect(client.stderr).toOutput('State/Province:');
  client.stdin.write('CA\n');
  await expect(client.stderr).toOutput('Postal/ZIP code:');
  client.stdin.write('90210\n');
  await expect(client.stderr).toOutput('Country code');
  client.stdin.write('US\n');
  await expect(client.stderr).toOutput('Company name');
  client.stdin.write('\n');
}

describe('domains buy --visa', () => {
  let origCI: string | undefined;

  // Force the `CI` env var to not be set, because that
  // alters the behavior of this command (skips prompts)
  beforeAll(() => {
    origCI = process.env.CI;
    delete process.env.CI;
  });

  afterAll(() => {
    process.env.CI = origCI;
  });

  afterEach(() => {
    delete process.env.VERCEL_VISA_CREDENTIAL;
  });

  it('sends the payment field in the purchase POST body with the credential from VERCEL_VISA_CREDENTIAL', async () => {
    useUser();
    process.env.VERCEL_VISA_CREDENTIAL = 'test_vtok_abc123';

    let capturedBody: any;
    mockPurchaseRoutes(body => {
      capturedBody = body;
    });

    client.setArgv('domains', 'buy', 'example.com', '--visa');
    const exitCodePromise = domains(client);

    await answerPurchasePrompts();

    await expect(exitCodePromise).resolves.toEqual(0);

    expect(capturedBody.payment).toEqual({
      provider: 'visa',
      credential: 'test_vtok_abc123',
    });
    expect(capturedBody.expectedPrice).toBe(100);
    expect(capturedBody.years).toBe(1);
    expect(capturedBody.autoRenew).toBe(true);
    expect(capturedBody.contactInformation.firstName).toBe('Jane');

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:buy',
        value: 'buy',
      },
      {
        key: 'argument:domain',
        value: '[REDACTED]',
      },
      {
        key: 'flag:visa',
        value: 'TRUE',
      },
    ]);
  });

  it('prompts for the credential with a masked input when the env var is not set', async () => {
    useUser();

    let capturedBody: any;
    mockPurchaseRoutes(body => {
      capturedBody = body;
    });

    client.setArgv('domains', 'buy', 'example.com', '--visa');
    const exitCodePromise = domains(client);

    await answerPurchasePrompts();

    await expect(client.stderr).toOutput('Visa payment credential:');
    client.stdin.write('prompted_credential_456\n');

    await expect(exitCodePromise).resolves.toEqual(0);

    expect(capturedBody.payment).toEqual({
      provider: 'visa',
      credential: 'prompted_credential_456',
    });
  });

  it('does not send a payment field without the --visa flag', async () => {
    useUser();

    let capturedBody: any;
    mockPurchaseRoutes(body => {
      capturedBody = body;
    });

    client.setArgv('domains', 'buy', 'example.com');
    const exitCodePromise = domains(client);

    await answerPurchasePrompts();

    await expect(exitCodePromise).resolves.toEqual(0);

    expect(capturedBody).not.toHaveProperty('payment');
    expect(capturedBody.expectedPrice).toBe(100);
  });

  it('shows a Visa-specific error when the order fails with visa_payment_failed', async () => {
    useUser();
    process.env.VERCEL_VISA_CREDENTIAL = 'test_vtok_declined';

    client.scenario.get(
      '/v1/registrar/domains/example.com/price',
      (_req, res) => {
        res.json({
          purchasePrice: 100,
          renewalPrice: 100,
          transferPrice: null,
          years: 1,
        });
      }
    );
    client.scenario.get(
      '/v1/registrar/domains/example.com/availability',
      (_req, res) => {
        res.json({ available: true });
      }
    );
    client.scenario.post(
      '/v1/registrar/domains/example.com/buy',
      (_req, res) => {
        res.json({ orderId: 'ord_declined' });
      }
    );
    client.scenario.get('/v1/registrar/orders/ord_declined', (_req, res) => {
      res.json({
        orderId: 'ord_declined',
        status: 'failed',
        domains: [{ domainName: 'example.com', status: 'failed' }],
        error: { code: 'visa_payment_failed' },
      });
    });

    client.setArgv('domains', 'buy', 'example.com', '--visa');
    const exitCodePromise = domains(client);

    await answerPurchasePrompts();

    await expect(client.stderr).toOutput('Error: Your Visa payment failed.');
    await expect(exitCodePromise).resolves.toEqual(1);
  });
});
