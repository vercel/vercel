import { client } from './client';
import type { Drain } from '../../src/util/drains/types';

export const defaultDrain: Drain = {
  id: 'drn_1',
  name: 'prod-logs',
  createdAt: 1600000000000,
  updatedAt: 1600000000000,
  ownerId: 'team_dummy',
  status: 'enabled',
  schemas: { log: { version: 'v1' } },
  delivery: {
    type: 'http',
    endpoint: 'https://logs.example.com',
    encoding: 'ndjson',
    headers: { Authorization: 'Bearer sk_do_not_leak' },
    secret: 'whsec_do_not_leak',
  },
  source: { kind: 'self-served' },
};

// Registers the happy-path list/find routes. Error cases register their own
// handlers instead of calling this.
export function useDrains(drains: Drain[] = [defaultDrain]) {
  client.scenario.get('/v1/drains', (_req, res) => {
    res.json({ drains });
  });

  for (const drain of drains) {
    client.scenario.get(`/v1/drains/${drain.id}`, (_req, res) => {
      res.json(drain);
    });
  }

  return drains;
}
