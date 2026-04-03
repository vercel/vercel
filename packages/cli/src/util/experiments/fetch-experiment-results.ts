import type Client from '../client';
import output from '../../output-manager';

export type ExperimentResultsQuery = {
  experimentName: string;
  metricEventName: string;
  unitField: string;
  peek?: boolean;
};

/**
 * GET /web/insights/experiment-results
 * Served by Web Analytics; results use project metrics and tracked events.
 */
export function buildExperimentResultsPath(
  projectId: string,
  query: ExperimentResultsQuery
): string {
  const params = new URLSearchParams();
  for (const name of query.metricEventName) {
    params.append('metricEventName', name);
  }
  params.set('unitField', query.unitField);
  if (query.peek) {
    params.set('peek', 'true');
  }

  const qs = params.toString();
  return `/v2/projects/${projectId}/experiments/${query.experimentName}/results?${qs}`;
}

export async function fetchExperimentResults(
  client: Client,
  projectId: string,
  query: ExperimentResultsQuery
): Promise<unknown> {
  const path = buildExperimentResultsPath(projectId, query);
  output.debug(`GET ${path}`);
  return client.fetch<unknown>(path);
}
