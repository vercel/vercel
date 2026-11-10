import { z } from 'zod';
import fetch from '../../util/fetch';
import ua from '../../util/ua';

export const STATUS_PAGE_URL = 'https://www.vercel-status.com';
export const STATUS_PAGE_HOST = new URL(STATUS_PAGE_URL).host;
const SUMMARY_URL = `${STATUS_PAGE_URL}/api/v2/summary.json`;
/** The 50 most recent incidents, resolved or not. */
const INCIDENTS_URL = `${STATUS_PAGE_URL}/api/v2/incidents.json`;
const REQUEST_TIMEOUT_MS = 10_000;
/** How far back resolved incidents are included. */
export const RECENT_DAYS = 7;

// Statuspage enums are kept as strings so a value added upstream renders raw
// instead of failing the command.
const ComponentRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  group_id: z.string().nullish(),
});

const ComponentSchema = ComponentRefSchema.extend({
  status: z.string(),
  group: z.boolean().optional().default(false),
});

const IncidentSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  impact: z.string(),
  created_at: z.string(),
  started_at: z.string().nullish(),
  resolved_at: z.string().nullish(),
  components: z.array(ComponentRefSchema).optional().default([]),
  incident_updates: z
    .array(
      z.object({
        id: z.string(),
        status: z.string(),
        body: z.string(),
        created_at: z.string(),
      })
    )
    .optional()
    .default([]),
});

const MaintenanceSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  impact: z.string(),
  scheduled_for: z.string().nullish(),
  scheduled_until: z.string().nullish(),
  components: z.array(ComponentRefSchema).optional().default([]),
});

const SummarySchema = z.object({
  page: z.object({ name: z.string(), url: z.string(), updated_at: z.string() }),
  status: z.object({ indicator: z.string(), description: z.string() }),
  components: z.array(ComponentSchema),
  incidents: z.array(IncidentSchema),
  scheduled_maintenances: z.array(MaintenanceSchema),
});

const IncidentsSchema = z.object({ incidents: z.array(IncidentSchema) });

/**
 * The incident's page on the status page. Scheduled maintenance uses the same
 * path. Preferred over the API's `stspg.io` shortlink, which redirects here.
 */
function incidentUrl(id: string): string {
  return `${STATUS_PAGE_URL}/incidents/${encodeURIComponent(id)}`;
}

/** Group component ID → group name. */
type GroupNames = ReadonlyMap<string, string>;

function toRef(c: z.infer<typeof ComponentRefSchema>, groups: GroupNames) {
  return {
    id: c.id,
    name: c.name,
    group: (c.group_id && groups.get(c.group_id)) || null,
  };
}

function toIncident(i: z.infer<typeof IncidentSchema>, groups: GroupNames) {
  return {
    id: i.id,
    name: i.name,
    status: i.status,
    impact: i.impact,
    startedAt: i.started_at ?? i.created_at,
    resolvedAt: i.resolved_at ?? null,
    url: incidentUrl(i.id),
    components: i.components.map(c => toRef(c, groups)),
    /** Newest first, as the status page lists them. */
    updates: i.incident_updates.map(u => ({
      id: u.id,
      status: u.status,
      body: u.body,
      createdAt: u.created_at,
    })),
  };
}

function toMaintenance(
  m: z.infer<typeof MaintenanceSchema>,
  groups: GroupNames
) {
  return {
    id: m.id,
    name: m.name,
    status: m.status,
    impact: m.impact,
    scheduledFor: m.scheduled_for ?? null,
    scheduledUntil: m.scheduled_until ?? null,
    url: incidentUrl(m.id),
    components: m.components.map(c => toRef(c, groups)),
  };
}

export type StatusComponentRef = ReturnType<typeof toRef>;
export type StatusIncident = ReturnType<typeof toIncident>;
export type StatusMaintenance = ReturnType<typeof toMaintenance>;
export type StatusReport = Awaited<ReturnType<typeof getStatusReport>>;

export type StatusPageErrorKind =
  | 'network'
  | 'rate_limited'
  | 'http'
  | 'invalid';

export class StatusPageError extends Error {
  constructor(
    readonly kind: StatusPageErrorKind,
    readonly detail: { httpStatus?: number; timedOut?: boolean } = {}
  ) {
    super(`Status page request failed: ${kind}`);
    this.name = 'StatusPageError';
  }
}

function networkError(err: unknown): StatusPageError {
  const timedOut =
    err instanceof Error &&
    (err.name === 'TimeoutError' || err.name === 'AbortError');
  return new StatusPageError('network', { timedOut });
}

async function getJson<T>(url: string, schema: z.ZodType<T>): Promise<T> {
  let response;
  let text;
  try {
    // The timeout covers reading the body too.
    response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': ua },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.ok) {
      text = await response.text();
    }
  } catch (err) {
    throw networkError(err);
  }
  if (response.status === 429) {
    throw new StatusPageError('rate_limited', { httpStatus: 429 });
  }
  if (!response.ok || text === undefined) {
    throw new StatusPageError('http', { httpStatus: response.status });
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new StatusPageError('invalid');
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new StatusPageError('invalid');
  }
  return result.data;
}

/** Gets the current status and recent incidents from the Vercel status page. */
export async function getStatusReport(now: number = Date.now()) {
  const [summary, history] = await Promise.all([
    getJson(SUMMARY_URL, SummarySchema),
    getJson(INCIDENTS_URL, IncidentsSchema),
  ]);

  // Groups are components with `group: true`; their members point at them.
  const groups: GroupNames = new Map(
    summary.components.filter(c => c.group).map(c => [c.id, c.name])
  );

  const since = new Date(now - RECENT_DAYS * 24 * 60 * 60 * 1000);
  const incidents = new Map<string, StatusIncident>();
  for (const incident of history.incidents.map(i => toIncident(i, groups))) {
    const resolvedAt = incident.resolvedAt && new Date(incident.resolvedAt);
    if (!resolvedAt || resolvedAt >= since) {
      incidents.set(incident.id, incident);
    }
  }
  // The summary is the source of truth for incidents that are still open.
  for (const incident of summary.incidents.map(i => toIncident(i, groups))) {
    incidents.set(incident.id, incident);
  }

  return {
    page: {
      name: summary.page.name,
      url: summary.page.url,
      updatedAt: summary.page.updated_at,
    },
    status: summary.status,
    components: summary.components
      .filter(c => !c.group)
      .map(c => ({ ...toRef(c, groups), status: c.status })),
    /** Unresolved incidents and those resolved since `since`, newest first. */
    incidents: [...incidents.values()].sort(
      (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)
    ),
    scheduledMaintenances: summary.scheduled_maintenances.map(m =>
      toMaintenance(m, groups)
    ),
    since: since.toISOString(),
  };
}
