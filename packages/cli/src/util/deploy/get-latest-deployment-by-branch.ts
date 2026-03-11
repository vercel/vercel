import { URLSearchParams } from 'url';
import type Client from '../client';

export interface BranchDeployment {
  id: string;
  url: string;
  readyState?: string;
}

interface DeploymentResponse {
  deployments: Array<{ uid: string; url: string; state?: string }>;
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
      return {
        id: deployments[0].uid,
        readyState: deployments[0].state,
        url: deployments[0].url,
      };
    }
  }

  return null;
}
