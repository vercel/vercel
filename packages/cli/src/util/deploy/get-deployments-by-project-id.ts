import { URLSearchParams } from 'url';
import type { Alias } from '../../types';
import type Client from '../client';

interface Response {
  deployments: DeploymentPartial[];
}
export interface DeploymentPartial {
  uid: string;
  name: string;
  url: string;
  created: number;
  createdAt: number;
  aliases: Alias[];
  state:
    | 'BUILDING'
    | 'ERROR'
    | 'INITIALIZING'
    | 'QUEUED'
    | 'READY'
    | 'CANCELED';
  creator: { uid: string };
}

interface Options {
  from?: number | null;
  limit?: number | null;
  continue?: boolean;
  max?: number;
}

export default async function getDeploymentsByProjectId(
  client: Client,
  projectId: string,
  options: Options = { from: null, limit: 100, continue: false },
  total = 0,
): Promise<DeploymentPartial[]> {
  const limit = options.limit || 100;

  const query = new URLSearchParams();
  query.set('projectId', projectId);
  query.set('limit', limit.toString());

  if (options.from) {
    query.set('from', options.from.toString());
  }

  const { deployments } = await client.fetch<Response>(
    `/v4/now/deployments?${query}`,
  );
  total += deployments.length;

  if (options.max && total >= options.max) {
    return deployments;
  }

  if (options.continue && deployments.length === limit) {
    const nextFrom = deployments[deployments.length - 1].created;
    const nextOptions = { ...options, from: nextFrom };
    deployments.push(
      ...(await getDeploymentsByProjectId(
        client,
        projectId,
        nextOptions,
        total,
      )),
    );
  }

  return deployments;
}
