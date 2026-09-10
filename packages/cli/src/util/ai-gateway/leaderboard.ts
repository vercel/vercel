import type Client from '../client';

// The leaderboards are served from vercel.com, not the AI Gateway host or the
// api host. Passing an absolute URL to client.fetch bypasses the default api
// host (new URL(url, apiUrl)). Overridable so tests can route it through the
// mock server, mirroring VERCEL_AI_GATEWAY_URL in ./models.
const DEFAULT_LEADERBOARD_BASE = 'https://vercel.com';

export type LeaderboardDataset = 'models' | 'labs' | 'apps' | 'providers';
export type LeaderboardModality = 'all' | 'text' | 'image' | 'video';
export type LeaderboardMetric =
  | 'requests'
  | 'tokens'
  | 'spend'
  | 'imageCount'
  | 'videoCount';
/** How the result is rendered. `json`/`csv` are the raw export payload. */
export type LeaderboardFormat = 'table' | 'json' | 'csv';

export const LEADERBOARD_DATASETS: readonly LeaderboardDataset[] = [
  'models',
  'labs',
  'apps',
  'providers',
];
export const LEADERBOARD_MODALITIES: readonly LeaderboardModality[] = [
  'all',
  'text',
  'image',
  'video',
];
export const LEADERBOARD_METRICS: readonly LeaderboardMetric[] = [
  'requests',
  'tokens',
  'spend',
  'imageCount',
  'videoCount',
];

/** `models` and `labs`: one entity's share of one metric on one day. */
export type LeaderboardTimeseriesRow = {
  date: string;
  group: 'model' | 'lab';
  name: string;
  metric: LeaderboardMetric;
  modality: LeaderboardModality;
  share_percent: number;
};

/** `apps` and `providers`: one ranked entity. */
export type LeaderboardRankedRow = {
  rank: number;
  name: string;
  ranked_by: string;
  url: string;
  description: string;
};

type LeaderboardResponseBase = {
  dataset: LeaderboardDataset;
  license: string;
  license_url: string;
};

export type LeaderboardTimeseriesResponse = LeaderboardResponseBase & {
  dataset: 'models' | 'labs';
  modality: LeaderboardModality;
  rows: LeaderboardTimeseriesRow[];
};

export type LeaderboardRankedResponse = LeaderboardResponseBase & {
  dataset: 'apps' | 'providers';
  rows: LeaderboardRankedRow[];
};

export interface LeaderboardQuery {
  dataset: LeaderboardDataset;
  /** Only meaningful for `models`/`labs`; omitted otherwise. */
  modality?: LeaderboardModality;
}

function leaderboardBase(): string {
  return process.env.VERCEL_LEADERBOARD_URL ?? DEFAULT_LEADERBOARD_BASE;
}

function buildUrl(query: LeaderboardQuery, format: 'json' | 'csv'): string {
  const params = new URLSearchParams();
  params.set('dataset', query.dataset);
  if (query.modality) {
    params.set('modality', query.modality);
  }
  params.set('format', format);
  return `${leaderboardBase()}/api/ai/leaderboard-export?${params.toString()}`;
}

/** Fetch the leaderboard as the structured JSON export payload. */
export async function fetchLeaderboard(
  client: Client,
  query: LeaderboardQuery & { dataset: 'models' | 'labs' }
): Promise<LeaderboardTimeseriesResponse>;
export async function fetchLeaderboard(
  client: Client,
  query: LeaderboardQuery & { dataset: 'apps' | 'providers' }
): Promise<LeaderboardRankedResponse>;
export async function fetchLeaderboard(
  client: Client,
  query: LeaderboardQuery
): Promise<LeaderboardTimeseriesResponse | LeaderboardRankedResponse> {
  return client.fetch(buildUrl(query, 'json'), { method: 'GET' });
}

/** Fetch the leaderboard as the raw CSV export, passed through verbatim. */
export async function fetchLeaderboardCsv(
  client: Client,
  query: LeaderboardQuery
): Promise<string> {
  const res = await client.fetch(buildUrl(query, 'csv'), {
    method: 'GET',
    json: false,
  });
  return res.text();
}

/** The most recent day present in a time-series result, or undefined. */
export function latestDate(
  rows: LeaderboardTimeseriesRow[]
): string | undefined {
  let max: string | undefined;
  for (const row of rows) {
    if (max === undefined || row.date > max) {
      max = row.date;
    }
  }
  return max;
}

/** Distinct dates present, most recent first (for error hints). */
export function availableDates(rows: LeaderboardTimeseriesRow[]): string[] {
  return Array.from(new Set(rows.map(r => r.date))).sort((a, b) =>
    a < b ? 1 : a > b ? -1 : 0
  );
}

/**
 * Collapse the full time-series (every day × metric) to the rows shown in the
 * human table: a single metric on a single day, ranked by share descending.
 * Modality is already applied server-side. Defaults to the latest day.
 */
export function filterTimeseries(
  rows: LeaderboardTimeseriesRow[],
  options: { metric: LeaderboardMetric; date?: string }
): LeaderboardTimeseriesRow[] {
  const day = options.date ?? latestDate(rows);
  return rows
    .filter(row => row.metric === options.metric && row.date === day)
    .sort((a, b) => b.share_percent - a.share_percent);
}
