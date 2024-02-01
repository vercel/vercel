import chance from 'chance';
import { client } from './client';
import { createDomain } from './domains';

export function useDns() {
  client.scenario.get('/v3/domains/:domain?/records', (_req, res) => {
    res.json({
      records: [
        {
          id: chance().guid(),
          name: chance().domain(),
          type: chance().string(),
          value: chance().integer(),
          createdAt: chance().timestamp(),
        },
      ],
      pagination: { count: 1, total: 1, page: 1, pages: 1 },
    });
  });

  client.scenario.get('/v5/domains', (req, res) => {
    const limit = parseInt(req.query.limit);
    const domains = Array.from({ length: limit }, (_, k) =>
      createDomain(k.toString())
    );
    res.json({
      domains: domains,
      pagination: { count: limit, total: limit, page: 1, pages: 1 },
    });
  });
}
