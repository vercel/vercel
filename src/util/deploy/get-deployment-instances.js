// @flow
import { Now } from '../types';
import type { InstancesInfo } from '../types';

async function getDeploymentInstances(
  now: Now,
  deploymentId: string,
  requestId: string
): Promise<InstancesInfo> {
  return now.fetch(
    `/v3/now/deployments/${encodeURIComponent(
      deploymentId
    )}/instances?init=1&requestId=${requestId}`
  );
}

export default getDeploymentInstances;
