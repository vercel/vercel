import type Client from '../../util/client';
import output from '../../output-manager';
import type { Deployment } from '@vercel-internals/types';

export async function getDeploymentUrlById(
  client: Client,
  deploymentId: string,
  accountId?: string
): Promise<string | null> {
  try {
    let fullDeploymentId = deploymentId;
    if (!fullDeploymentId.startsWith('dpl_')) {
      fullDeploymentId = `dpl_${deploymentId}`;
    }

    const deployment = await client.fetch<Deployment>(
      `/v13/deployments/${fullDeploymentId}`,
      { accountId }
    );

    if (!deployment || !deployment.url) {
      return null;
    }

    return `https://${deployment.url}`;
  } catch (error) {
    output.debug(`Failed to fetch deployment by ID: ${error}`);
    return null;
  }
}
