import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Persistent state for de-duping notifications across runs.
 *
 * Shape:
 *   {
 *     seen: { [alertId: string]: isoTimestamp },
 *     lastPollAt: isoTimestamp
 *   }
 *
 * `alertId` is a stable id we compute for each emitted alert (see filters.mjs).
 */

const MAX_SEEN = 2000;
const SEEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function loadState(path) {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      seen: parsed.seen && typeof parsed.seen === 'object' ? parsed.seen : {},
      lastPollAt: parsed.lastPollAt || null,
    };
  } catch (err) {
    if (err.code === 'ENOENT') return { seen: {}, lastPollAt: null };
    throw err;
  }
}

export async function saveState(path, state) {
  await mkdir(dirname(path), { recursive: true });
  const pruned = pruneSeen(state.seen);
  const payload = {
    seen: pruned,
    lastPollAt: state.lastPollAt || null,
  };
  await writeFile(path, JSON.stringify(payload, null, 2));
}

function pruneSeen(seen) {
  const now = Date.now();
  const entries = Object.entries(seen).filter(([, ts]) => {
    const t = Date.parse(ts);
    return Number.isFinite(t) && now - t < SEEN_TTL_MS;
  });
  entries.sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]));
  return Object.fromEntries(entries.slice(0, MAX_SEEN));
}

export function markSeen(state, id) {
  state.seen[id] = new Date().toISOString();
}

export function hasSeen(state, id) {
  return Object.prototype.hasOwnProperty.call(state.seen, id);
}
