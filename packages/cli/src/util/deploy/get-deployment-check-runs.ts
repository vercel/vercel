import type Client from '../client';

export interface CheckRun {
  id: string;
  name: string;
  status: 'registered' | 'running' | 'completed';
  conclusion:
    | 'canceled'
    | 'failed'
    | 'neutral'
    | 'succeeded'
    | 'skipped'
    | 'stale';
  source: { kind: string; jobName?: string } | string;
  externalUrl?: string | null;
  detailsUrl?: string | null;
  startedAt?: number;
  completedAt?: number;
}

interface CheckRunsResponse {
  runs: CheckRun[];
}

export async function getDeploymentCheckRuns(
  client: Client,
  deploymentId: string
) {
  const response = await client.fetch<CheckRunsResponse>(
    `/v2/deployments/${encodeURIComponent(deploymentId)}/check-runs`
  );
  return response;
}
