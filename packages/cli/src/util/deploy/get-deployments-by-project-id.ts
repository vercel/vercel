import { URLSearchParams } from 'url';
import Client from '../client';

type Response = {
  deployments: Array<{
    uid: string;
    name: string;
    url: string;
    created: number;
    state: 'INITIALIZING' | 'FROZEN' | 'READY' | 'ERROR';
    creator: { uid: string };
    instanceCount: number;
    scale: {
      [key: string]: number;
    };
  }>;
};

interface Options {
  from: number | null;
  limit: number | null;
  continue: boolean;
  max?: number;
}

export default async function getDeploymentsByProjectId(
  client: Client,
  projectId: string,
  options: Options = { from: null, limit: 100, continue: false },
  total: number = 0
) {
  const limit = options.limit || 100;

  const query = new URLSearchParams();
  query.set('projectId', projectId);
  query.set('limit', limit.toString());

  if (options.from) {
    query.set('from', options.from.toString());
  }

  const { deployments } = await client.fetch<Response>(`/v4/now/deployments?${query}`);
  total += deployments.length;

  if (options.max && total >= options.max) {
    return deployments;
  }

  if (options.continue && deployments.length === limit) {
    const nextFrom = deployments[deployments.length - 1].created;
    const nextOptions = Object.assign({}, options, { from: nextFrom });
    deployments.push(...(await getDeploymentsByProjectId(client, projectId, nextOptions, total)));
  }

  return deployments;
}

export async function getAllDeploymentsByProjectId(
  client: Client,
  projectId: string
) {
  return getDeploymentsByProjectId(client, projectId, { from: null, limit: 100, continue: true });
}
