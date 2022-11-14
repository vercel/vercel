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

export default async function fetchDeploymentsByAppName(
  client: Client,
  appName: string
) {
  const { deployments } = await client.fetch<Response>(
    `/v3/now/deployments?app=${encodeURIComponent(appName)}`
  );
  return deployments;
}
