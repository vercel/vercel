import { describe, expect, it } from 'vitest';
import purchaseDomain from '../../../../src/util/domains/purchase-domain';
import {
  DomainChargeOutcomeUnknown,
  DomainPurchaseRefundFailed,
  DomainPurchaseRefunded,
  UnexpectedDomainPurchaseError,
} from '../../../../src/util/errors-ts';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';

const CONTACT = {
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  phone: '+11122233344',
  address1: '1 Main St',
  city: 'Austin',
  state: 'TX',
  zip: '78701',
  country: 'US',
};

describe('purchaseDomain', () => {
  it('reports success once the order completes, without looking the domain up', async () => {
    useUser();
    let buys = 0;
    client.scenario.post(
      '/v1/registrar/domains/example.com/buy',
      (_req, res) => {
        buys++;
        res.json({ orderId: 'order_1' });
      }
    );
    client.scenario.get('/v1/registrar/orders/order_1', (_req, res) => {
      res.json({
        orderId: 'order_1',
        domains: [{ domainName: 'example.com', status: 'completed' }],
        status: 'completed',
      });
    });
    // A freshly bought domain may not be found yet; that must not fail the purchase.
    client.scenario.get('/v4/domains/example.com', (_req, res) => {
      res.status(404).json({ error: { code: 'not_found' } });
    });

    const result = await purchaseDomain(
      client,
      'example.com',
      20,
      1,
      true,
      CONTACT
    );

    expect(result).toEqual({ orderId: 'order_1' });
    expect(buys).toEqual(1);
  });

  it.each([
    {
      name: 'a failed refund',
      item: 'refund-failed',
      status: 'failed',
      expected: DomainPurchaseRefundFailed,
    },
    {
      name: 'a refund',
      item: 'refunded',
      status: 'failed',
      expected: DomainPurchaseRefunded,
    },
    {
      // It may still go through, so a retry could charge twice.
      name: 'a pending item as an unknown outcome',
      item: 'pending',
      status: 'completed',
      expected: DomainChargeOutcomeUnknown,
    },
    {
      name: 'a failed item as a failure',
      item: 'failed',
      status: 'failed',
      expected: UnexpectedDomainPurchaseError,
    },
  ])('reports $name', async ({ item, status, expected }) => {
    useUser();
    client.scenario.post(
      '/v1/registrar/domains/example.com/buy',
      (_req, res) => {
        res.json({ orderId: 'order_1' });
      }
    );
    client.scenario.get('/v1/registrar/orders/order_1', (_req, res) => {
      res.json({
        orderId: 'order_1',
        domains: [{ domainName: 'example.com', status: item }],
        status,
      });
    });

    const result = await purchaseDomain(
      client,
      'example.com',
      20,
      1,
      true,
      CONTACT
    );

    expect(result).toBeInstanceOf(expected);
  });

  it('sends the order once and reports an unknown outcome on a 5xx', async () => {
    useUser();
    let buys = 0;
    client.scenario.post(
      '/v1/registrar/domains/example.com/buy',
      (_req, res) => {
        buys++;
        res.status(503).json({ error: { code: 'service_unavailable' } });
      }
    );

    const result = await purchaseDomain(
      client,
      'example.com',
      20,
      1,
      true,
      CONTACT
    );

    expect(result).toBeInstanceOf(DomainChargeOutcomeUnknown);
    expect(buys).toEqual(1);
  });

  it('fails right away on a rate limit instead of waiting out Retry-After', async () => {
    useUser();
    let buys = 0;
    client.scenario.post(
      '/v1/registrar/domains/example.com/buy',
      (_req, res) => {
        buys++;
        res
          .status(429)
          .set('Retry-After', '60')
          .json({ error: { code: 'rate_limited' } });
      }
    );

    const started = Date.now();
    await expect(
      purchaseDomain(client, 'example.com', 20, 1, true, CONTACT)
    ).rejects.toMatchObject({ status: 429 });
    expect(Date.now() - started).toBeLessThan(5000);
    expect(buys).toEqual(1);
  });
});
