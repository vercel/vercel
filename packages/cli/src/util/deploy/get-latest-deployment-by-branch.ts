import { URLSearchParams } from 'url';
import type Client from '../client';

export interface BranchDeployment {
  id: string;
  url: string;
  readyState?: string;
}

interface DeploymentResponse {
  deployments: Array<{
    id?: string;
    uid?: string;
    readyState?: string;
    state?: string;
    url: string;
  }>;
}

export async function getLatestDeploymentByBranch(
  client: Client,
  projectId: string,
  branch: string,
  accountId?: string,
  options: {
    readyOnly?: boolean;
  } = {}
): Promise<BranchDeployment | null> {
  const branchMetaKeys = [
    'githubCommitRef',
    'gitlabCommitRef',
    'bitbucketCommitRef',
  ];
  const { readyOnly = true } = options;

  for (const metaKey of branchMetaKeys) {
    const query = new URLSearchParams();
    query.set('projectId', projectId);
    query.set('limit', '1');
    if (readyOnly) {
      query.set('state', 'READY');
    }
    query.set(`meta-${metaKey}`, branch);

    const { deployments } = await client.fetch<DeploymentResponse>(
      `/v6/deployments?${query}`,
      { accountId }
    );

    if (deployments.length > 0) {
      const deployment = deployments[0];
      const id = deployment.uid ?? deployment.id;
      if (!id) {
        continue;
      }

      return {
        id,
        readyState: deployment.state ?? deployment.readyState,
        url: deployment.url,
      };
    }
  }

  return null;
}
