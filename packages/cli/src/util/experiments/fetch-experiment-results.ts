import type Client from '../client';
import output from '../../output-manager';

export type ExperimentResultsQuery = {
  experimentName: string;
  metricEventNames: string[];
  metricTypes: string[];
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
  params.set('projectId', projectId);
  params.set('experimentName', query.experimentName);
  for (const name of query.metricEventNames) {
    params.append('metricEventNames', name);
  }
  for (const t of query.metricTypes) {
    params.append('metricTypes', t);
  }
  params.set('unitField', query.unitField);
  if (query.peek) {
    params.set('peek', 'true');
  }

  const qs = params.toString();
  return `/web/insights/experiment-results?${qs}`;
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
