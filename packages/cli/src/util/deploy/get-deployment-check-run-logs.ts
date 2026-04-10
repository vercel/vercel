import type Client from '../client';

export interface CheckRunLog {
  text: string;
  createdAt: number;
}

export async function getDeploymentCheckRunLogs(
  client: Client,
  deploymentId: string,
  checkRunId: string
): Promise<CheckRunLog[]> {
  const response = await client.fetch<{ logs: CheckRunLog[] }>(
    `/v2/deployments/${encodeURIComponent(deploymentId)}/check-runs/${encodeURIComponent(checkRunId)}/logs`
  );
  return response.logs ?? [];
}
