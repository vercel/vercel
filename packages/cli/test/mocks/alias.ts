import chance from 'chance';
import { client } from './client';

export function useAlias() {
  function create(alias: string) {
    return {
      alias: `dummy-${alias}.app`,
      created: chance().timestamp(),
      createdAt: chance().timestamp(),
      deletedAt: null,
      deployment: {
        id: chance().guid(),
        url: chance().domain(),
      },
      deploymentId: chance().guid(),
      projectId: chance().guid(),
      redirect: null,
      redirectStatusCode: null,
      uid: chance().guid(),
      updatedAt: chance().timestamp(),
    };
  }

  client.scenario.get('/v3/now/aliases', (_req, res) => {
    const limit = parseInt(_req.query.limit);
    const aliases = Array.from({ length: limit }, (v, i) => create(`${i}`));
    res.json({
      aliases: aliases,
      pagination: { count: limit, total: limit, page: 1, pages: 1 },
    });
  });
}
