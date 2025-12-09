import type Client from '../../util/client';
import output from '../../output-manager';
import type { Deployment } from '@vercel-internals/types';

export async function getDeploymentUrlById(
  client: Client,
  deploymentIdOrUrl: string,
  accountId?: string
): Promise<string | null> {
  try {
    // Accept a full deployment URL directly
    if (
      deploymentIdOrUrl.startsWith('http://') ||
      deploymentIdOrUrl.startsWith('https://')
    ) {
      try {
        const url = new URL(deploymentIdOrUrl);
        // Normalize to origin (scheme + host), ignore path/query/fragment
        return url.origin;
      } catch (err) {
        output.debug(`Invalid deployment URL provided: ${deploymentIdOrUrl}`);
        return null;
      }
    }

    if (deploymentIdOrUrl.includes('vercel.app')) {
      return `https://${deploymentIdOrUrl}`;
    }

    let fullDeploymentId = deploymentIdOrUrl;
    if (!fullDeploymentId.startsWith('dpl_')) {
      fullDeploymentId = `dpl_${deploymentIdOrUrl}`;
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
