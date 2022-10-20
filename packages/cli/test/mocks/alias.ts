import chance from 'chance';
import { client } from './client';

export function useAlias() {
  const alias = {
    alias: 'dummy.app',
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

  client.scenario.get('/v3/now/aliases', (_req, res) => {
    res.json({
      aliases: [alias],
      pagination: { count: 1, total: 1, page: 1, pages: 1 },
    });
  });

  return alias;
}
