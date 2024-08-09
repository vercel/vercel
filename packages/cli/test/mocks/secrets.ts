import chance from 'chance';
import { client } from './client';

export function useSecrets({
  name,
  created,
}: {
  name: string;
  created: number;
}) {
  const secret = {
    uid: chance().guid(),
    name: name || chance().name(),
    created: created || chance().timestamp(),
  };

  client.scenario.get('/v3/now/secrets', (_req, res) => {
    res.json({
      secrets: [secret],
      pagination: {
        count: 1,
        next: 0,
        prev: 0,
      },
    });
  });

  return secret;
}
