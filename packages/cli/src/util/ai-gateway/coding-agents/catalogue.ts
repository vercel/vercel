import type { Model } from '../models';
import type { SetupContext } from './types';
import { GATEWAY_DEFAULT_MODEL } from './gateway';

// Shared selection: language + tool-use + not retired, per-vendor size gates opt-in.
export function agenticModels(
  ctx: SetupContext,
  opts: { requireContextWindow?: boolean; requireMaxTokens?: boolean } = {}
): Model[] {
  return (ctx.gatewayModels ?? []).filter(
    m =>
      m.type === 'language' &&
      (m.tags ?? []).includes('tool-use') &&
      !m.deprecated_at &&
      (!opts.requireContextWindow || Boolean(m.context_window)) &&
      (!opts.requireMaxTokens || Boolean(m.max_tokens))
  );
}

export function defaultFirst(models: Model[]): Model[] {
  const rest = models
    .filter(m => m.id !== GATEWAY_DEFAULT_MODEL)
    .sort((a, b) => a.id.localeCompare(b.id));
  const preferred = models.find(m => m.id === GATEWAY_DEFAULT_MODEL);
  return preferred ? [preferred, ...rest] : rest;
}

export interface ShortlistOpts {
  requireContextWindow?: boolean;
  requireMaxTokens?: boolean;
  creator?: string;
  creatorLimit?: number;
  overallLimit?: number;
  ensureDefault?: boolean;
}

// The picker shortlist: the creator's newest models first, then the leaderboard's
// top sellers from ctx.topModels — default-first alphabetical when unavailable.
export function shortlistModels(
  ctx: SetupContext,
  opts: ShortlistOpts = {}
): Model[] {
  const { creator, creatorLimit = 5, overallLimit = 10, ensureDefault } = opts;
  const eligible = agenticModels(ctx, opts);
  const byId = new Map(eligible.map(m => [m.id, m]));
  const picked: Model[] = [];
  const take = (m: Model | undefined) => {
    if (m && !picked.includes(m)) picked.push(m);
  };

  if (creator) {
    const rank = new Map((ctx.topModels ?? []).map((t, i) => [t.id, i]));
    const unranked = Number.MAX_SAFE_INTEGER;
    eligible
      .filter(m => m.id.startsWith(`${creator}/`))
      .sort(
        (a, b) =>
          (rank.get(a.id) ?? unranked) - (rank.get(b.id) ?? unranked) ||
          (b.released ?? b.created ?? 0) - (a.released ?? a.created ?? 0) ||
          a.id.localeCompare(b.id)
      )
      .slice(0, creatorLimit)
      .forEach(take);
  }

  const overallStart = picked.length;
  const room = () => picked.length - overallStart < overallLimit;
  if (ensureDefault) {
    take(byId.get(GATEWAY_DEFAULT_MODEL));
  }
  if (ctx.topModels) {
    for (const top of ctx.topModels) {
      if (!room()) break;
      take(byId.get(top.id));
    }
  } else {
    for (const m of defaultFirst(eligible)) {
      if (!room()) break;
      take(m);
    }
  }
  return picked;
}

export function pinnedDefault(
  ctx: SetupContext,
  opts: { creator?: string; fallback?: string } = {}
): string {
  const fallback = opts.fallback ?? GATEWAY_DEFAULT_MODEL;
  if (opts.creator) {
    const family = shortlistModels(ctx, {
      creator: opts.creator,
      overallLimit: 0,
    });
    if (family[0]) {
      return family[0].id;
    }
  }
  return ctx.topModels?.[0]?.id ?? fallback;
}
