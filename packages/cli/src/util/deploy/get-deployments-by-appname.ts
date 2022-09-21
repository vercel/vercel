import type Client from '../client';

interface Response {
  deployments: {
    uid: string;
    name: string;
    url: string;
    created: number;
    state: 'INITIALIZING' | 'FROZEN' | 'READY' | 'ERROR';
    creator: { uid: string };
    instanceCount: number;
    scale: Record<string, number>;
  }[];
}

export default async function fetchDeploymentsByAppName(
  client: Client,
  appName: string,
) {
  const { deployments } = await client.fetch<Response>(
    `/v3/now/deployments?app=${encodeURIComponent(appName)}`,
  );
  return deployments;
}
