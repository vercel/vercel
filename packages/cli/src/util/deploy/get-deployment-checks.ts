import Client from '../client';

type CheckStatus = 'registered' | 'running' | 'completed';
type CheckConclusion =
  | 'canceled'
  | 'failed'
  | 'neutral'
  | 'succeeded'
  | 'skipped'
  | 'stale';

export interface DeploymentCheck {
  id: string;
  status: CheckStatus;
  conclusion: CheckConclusion;
  name: string;
  startedAt: number;
  completedAt: number;
  createdAt: number;
  updatedAt: number;
  integrationId: string;
  rerequestable: boolean;
}

export interface DeploymentChecksResponse {
  checks: DeploymentCheck[];
}

export async function getDeploymentChecks(
  client: Client,
  deploymentId: string
) {
  const checksResponse = await client.fetch<DeploymentChecksResponse>(
    `/v1/deployments/${encodeURIComponent(deploymentId)}/checks`
  );
  return checksResponse;
}
