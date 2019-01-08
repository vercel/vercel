import Client from '../client';

type InstancesInfo = {
  [dc: string]: {
    instances: Array<{}>;
  };
};

export default async function getDeploymentInstances(
  now: Client,
  deploymentId: string,
  requestId: string
) {
  return now.fetch<InstancesInfo>(
    `/v3/now/deployments/${encodeURIComponent(
      deploymentId
    )}/instances?init=1&requestId=${requestId}`
  );
}
