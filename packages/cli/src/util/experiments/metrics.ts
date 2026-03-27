import type { JSONObject } from '@vercel-internals/types';
import type Client from '../client';
import type {
  ExperimentMetric,
  ExperimentMetricsListResponse,
  PutExperimentMetricRequest,
} from '../flags/types';
import output from '../../output-manager';

/**
 * PUT /v1/projects/:projectId/feature-flags/metrics
 */
export async function putExperimentMetric(
  client: Client,
  projectId: string,
  body: PutExperimentMetricRequest
): Promise<ExperimentMetric> {
  const url = `/v1/projects/${encodeURIComponent(projectId)}/feature-flags/metrics`;
  output.debug(`PUT ${url}`);
  return client.fetch<ExperimentMetric>(url, {
    method: 'PUT',
    body: body as unknown as JSONObject,
  });
}

/**
 * GET /v1/projects/:projectId/feature-flags/metrics
 */
export async function listExperimentMetrics(
  client: Client,
  projectId: string,
  options?: { withMetadata?: boolean }
): Promise<ExperimentMetric[]> {
  let url = `/v1/projects/${encodeURIComponent(projectId)}/feature-flags/metrics`;
  if (options?.withMetadata) {
    url += '?withMetadata=true';
  }
  output.debug(`GET ${url}`);
  const res = await client.fetch<ExperimentMetricsListResponse>(url);
  return res.data;
}
