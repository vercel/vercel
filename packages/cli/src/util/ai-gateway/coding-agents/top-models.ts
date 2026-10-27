import type Client from '../../client';
import output from '../../../output-manager';
import { listModels, type Model } from '../models';
import {
  fetchLeaderboard,
  filterTimeseries,
  type LeaderboardTimeseriesRow,
} from '../leaderboard';

export interface TopModel {
  id: string;
  name: string;
}

export const TOP_MODELS_LIMIT = 10;

// Spend ranks frontier coding models; requests would rank cheap high-volume ones.
const TOP_MODELS_METRIC = 'spend' as const;
const TOP_MODELS_MODALITY = 'text' as const;
const MIN_USABLE_MODELS = 3;
const DEFAULT_TIMEOUT_MS = 2000;
const OTHER_ROW_NAME = 'other';

// `slug` is read first so this upgrades on its own if the export adds one.
type LeaderboardModelRow = LeaderboardTimeseriesRow & { slug?: string };

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export function resolveTopModels(
  rows: LeaderboardTimeseriesRow[],
  catalog: Model[],
  limit: number = TOP_MODELS_LIMIT
): TopModel[] {
  // Two models sharing a display name make the join ambiguous — drop, not guess.
  const idByName = new Map<string, string | null>();
  for (const model of catalog) {
    if (!model.name || !model.id) continue;
    const key = normalizeName(model.name);
    if (!idByName.has(key)) idByName.set(key, model.id);
    else if (idByName.get(key) !== model.id) idByName.set(key, null);
  }

  const nameById = new Map(catalog.map(model => [model.id, model.name]));
  const ranked = filterTimeseries(rows, { metric: TOP_MODELS_METRIC });
  const resolved: TopModel[] = [];
  const seen = new Set<string>();

  for (const row of ranked as LeaderboardModelRow[]) {
    if (resolved.length >= limit) break;
    if (normalizeName(row.name) === OTHER_ROW_NAME) continue;
    // Dropped, not guessed: a catalog gap shortens the list instead of writing a bad id.
    const id = row.slug ?? idByName.get(normalizeName(row.name)) ?? undefined;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    resolved.push({ id, name: nameById.get(id) ?? row.name });
  }

  return resolved;
}

// Abandoning it isn't enough: a live retry or Retry-After sleep outlives the deadline.
function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number
): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`timed out after ${ms}ms`));
    }, ms);
    timer.unref?.();
    run(controller.signal)
      .then(resolvePromise, reject)
      .finally(() => clearTimeout(timer));
  });
}

/** Top gateway models by spend; null on any failure, so callers keep their own list. */
export async function fetchTopModels(
  client: Client,
  opts: { limit?: number; timeoutMs?: number } = {}
): Promise<TopModel[] | null> {
  const { limit = TOP_MODELS_LIMIT, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  try {
    // Neither a retry nor a rate-limit wait can outlive the deadline.
    const fetchOpts = { retry: { retries: 0 }, bailOn429: true } as const;
    const [leaderboard, catalog] = await withTimeout(
      signal =>
        Promise.all([
          fetchLeaderboard(
            client,
            { dataset: 'models', modality: TOP_MODELS_MODALITY },
            { signal, ...fetchOpts }
          ),
          listModels(client, { signal, ...fetchOpts }),
        ]),
      timeoutMs
    );

    const models = resolveTopModels(leaderboard.rows ?? [], catalog, limit);
    if (models.length < MIN_USABLE_MODELS) {
      output.debug(
        `Leaderboard returned only ${models.length} usable models; using the built-in list.`
      );
      return null;
    }
    return models;
  } catch (err) {
    output.debug(
      `Could not fetch the model leaderboard, using the built-in list: ${(err as Error).message}`
    );
    return null;
  }
}
