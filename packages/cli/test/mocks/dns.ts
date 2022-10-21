import chance from 'chance';
import { client } from './client';
import { createDomain } from './domains';

export function useDns() {
  // A hack to have a counter for each record. Each cert will hit this endpoint.
  let counter = 0;
  client.scenario.get('/v3/domains/example.com/records', (_req, res) => {
    res.json({
      records: [
        {
          id: counter++,
          name: `example-${counter}.com`,
          type: 'A',
          value: 1,
          createdAt: chance().timestamp(),
        },
      ],
      pagination: { count: 1, total: 1, page: 1, pages: 1 },
    });
  });

  client.scenario.get('/v5/domains', (_req, res) => {
    counter = 0; // Reset the counter, so that if the test is run twice, it will start from 0.
    const limit = parseInt(_req.query.limit);
    const domains = Array.from({ length: limit }, () => createDomain(''));
    res.json({
      domains: domains,
      pagination: { count: limit, total: limit, page: 1, pages: 1 },
    });
  });
}
