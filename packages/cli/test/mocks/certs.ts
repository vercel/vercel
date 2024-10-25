import chance from 'chance';
import { client } from './client';

export function useCert() {
  function create(cert: string) {
    return {
      uid: `dummy-${cert}.cert`,
      created: chance().timestamp(),
      expiration: chance().timestamp(),
      renew: chance().bool(),
      cns: [chance().domain()],
      age: chance().integer({ min: 0, max: 1000 }),
    };
  }

  client.scenario.get('/v4/certs', (req, res) => {
    const limit = parseInt(req.query.limit, 10);
    const certs = Array.from({ length: limit }, (v, i) => create(`${i}`));
    res.json({
      certs,
      pagination: { count: limit, total: limit, page: 1, pages: 1 },
    });
  });
}
