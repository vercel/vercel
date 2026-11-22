import type { JSONObject } from '@vercel-internals/types';
import type Client from '../../util/client';
import type {
  AnalyticsEventsResponse,
  Experiment,
  ExperimentAction,
  ExperimentAnalysis,
} from './types';

function experimentsUrl(projectId: string): string {
  return `/v1/projects/${encodeURIComponent(projectId)}/feature-flags/experiments`;
}

function experimentUrl(projectId: string, experimentIdOrSlug: string): string {
  return `${experimentsUrl(projectId)}/${encodeURIComponent(experimentIdOrSlug)}`;
}

export async function listExperiments(
  client: Client,
  projectId: string
): Promise<Experiment[]> {
  const response = await client.fetch<{ data: Experiment[] }>(
    experimentsUrl(projectId)
  );
  return response.data;
}

export function getExperiment(
  client: Client,
  projectId: string,
  experimentIdOrSlug: string
): Promise<Experiment> {
  return client.fetch<Experiment>(experimentUrl(projectId, experimentIdOrSlug));
}

export function createExperiment(
  client: Client,
  projectId: string,
  body: JSONObject
): Promise<Experiment> {
  return client.fetch<Experiment>(experimentsUrl(projectId), {
    method: 'PUT',
    body,
  });
}

export function updateExperiment(
  client: Client,
  projectId: string,
  experimentIdOrSlug: string,
  body: JSONObject
): Promise<Experiment> {
  return client.fetch<Experiment>(
    experimentUrl(projectId, experimentIdOrSlug),
    { method: 'PATCH', body }
  );
}

export function applyExperimentAction(
  client: Client,
  projectId: string,
  experimentIdOrSlug: string,
  action: ExperimentAction
): Promise<Experiment> {
  return client.fetch<Experiment>(
    `${experimentUrl(projectId, experimentIdOrSlug)}/actions`,
    { method: 'POST', body: action as unknown as JSONObject }
  );
}

export async function deleteExperiment(
  client: Client,
  projectId: string,
  experimentIdOrSlug: string
): Promise<void> {
  await client.fetch(experimentUrl(projectId, experimentIdOrSlug), {
    method: 'DELETE',
  });
}

export function getExperimentAnalysis(
  client: Client,
  projectId: string,
  experimentId: string,
  body: JSONObject
): Promise<ExperimentAnalysis> {
  return client.fetch<ExperimentAnalysis>(
    `/v3/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(experimentId)}/results`,
    { method: 'POST', body }
  );
}

/** Public path for observability's granular event rows. */
const OBSERVABILITY_EVENTS_PATH = '/v1/observability/events';

/**
 * Absolute URL of a local observability-api, for use before the public route
 * exists. `client.fetch` still applies the token and team, because an absolute
 * URL only replaces the API origin.
 */
function observabilityEventsUrl(): string {
  const override = process.env.VERCEL_OBSERVABILITY_EVENTS_URL;
  return override ? override : OBSERVABILITY_EVENTS_PATH;
}

interface MicrofrontendsGroupProject {
  id: string;
  microfrontends?: {
    enabled?: boolean;
    isDefaultApp?: boolean;
    routeObservabilityToDefaultApp?: boolean;
    routeObservabilityToThisProject?: boolean;
  };
}

/**
 * Returns the project that owns a project's Web Analytics rows.
 *
 * A microfrontend child routes its analytics to the group's default app, so
 * exposures for its experiments are stored under that project rather than the
 * one the experiment belongs to. `api-web-analytics` resolves this server-side
 * for experiment results; the events API does not, so the caller resolves it.
 */
export async function resolveAnalyticsProjectId(
  client: Client,
  ownerId: string,
  projectId: string
): Promise<string> {
  let groups: { projects?: MicrofrontendsGroupProject[] }[];
  try {
    ({ groups = [] } = await client.fetch<{
      groups?: { projects?: MicrofrontendsGroupProject[] }[];
    }>('/v1/microfrontends/groups', { accountId: ownerId }));
  } catch {
    // A team without microfrontends access cannot have a data project other
    // than the one asked for.
    return projectId;
  }

  for (const group of groups) {
    const entry = group.projects?.find(project => project.id === projectId);
    if (!entry) continue;
    const settings = entry.microfrontends;
    if (
      !settings?.enabled ||
      settings.isDefaultApp ||
      settings.routeObservabilityToThisProject ||
      settings.routeObservabilityToDefaultApp === false
    ) {
      return projectId;
    }
    const defaultApp = group.projects?.find(
      project => project.microfrontends?.isDefaultApp
    );
    return defaultApp?.id ?? projectId;
  }
  return projectId;
}

export function queryAnalyticsEvents(
  client: Client,
  ownerId: string,
  projectId: string,
  {
    filter,
    select,
    start,
    end,
    limit,
    order = 'desc',
  }: {
    filter: string;
    select: string[];
    start: string;
    end: string;
    limit: number;
    order?: 'asc' | 'desc';
  }
): Promise<AnalyticsEventsResponse> {
  return client.fetch<AnalyticsEventsResponse>(observabilityEventsUrl(), {
    method: 'POST',
    body: {
      event: 'vercel.analytics',
      scope: { ownerId, projectIds: [projectId] },
      timeRange: { start, end },
      select,
      filter,
      order,
      limit,
    },
    accountId: ownerId,
  });
}
