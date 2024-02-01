import chance from 'chance';
import { client } from './client';

export function createDomain(k: string) {
  return {
    suffix: chance().bool(),
    verified: chance().bool(),
    nameservers: chance().string(),
    intendedNameservers: chance().string(),
    customNameservers: chance().string(),
    creator: {
      username: chance().string(),
      email: chance().email(),
      customerId: chance().guid(),
      isDomainReseller: chance().bool(),
      id: chance().guid(),
    },
    createdAt: chance().timestamp(),
    id: chance().guid(),
    name: k ? `example-${k}.com` : 'example.com',
    expiresAt: chance().timestamp(),
    boughtAt: chance().timestamp(),
    orderedAt: chance().timestamp(),
    renew: chance().bool(),
    serviceType: chance().string(),
    transferredAt: chance().timestamp(),
    transferStartedAt: chance().timestamp(),
  };
}

export function useDomains() {
  client.scenario.get('/v5/domains', (req, res) => {
    const limit = parseInt(req.query.limit);
    const domains = Array.from({ length: limit }, (v, i) =>
      createDomain(`${i}`)
    );
    res.json({
      domains: domains,
      pagination: { count: limit, total: limit, page: 1, pages: 1 },
    });
  });
}

export function useDomain(postfix: string) {
  client.scenario.get(
    `/v4/domains/${encodeURIComponent(`example-${postfix}.com`)}`,
    (req, res) => {
      const domain = createDomain(postfix);
      res.json({
        domain,
      });
    }
  );
}
