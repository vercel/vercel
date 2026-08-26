import { appendFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getOnboardSessionDir } from './session-dir';

export const LEDGER_FILENAME = 'ledger.ndjson';

/**
 * One journaled fact. `type` discriminates; everything else is the fact's own
 * fields. Kept as an open record rather than a closed union so a new effect
 * event never needs a matching change on the reading side.
 */
export interface LedgerEvent {
  type: string;
  /** ISO timestamp, added by `recordSessionEvent`. */
  at?: string;
  [key: string]: unknown;
}

/**
 * Append one event to the session ledger.
 *
 * A no-op outside an onboard session, and never throws inside one:
 * journaling is an observer, and an observer that can fail the operation it
 * observes is worse than no observer. Writes are single `appendFileSync` calls well under
 * `PIPE_BUF`, so parallel tool calls interleave whole lines.
 */
export function recordSessionEvent(event: LedgerEvent): void {
  const dir = getOnboardSessionDir();
  if (!dir) return;

  try {
    appendFileSync(
      join(dir, LEDGER_FILENAME),
      `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`
    );
  } catch {
    // Never let bookkeeping break the command doing the real work.
  }
}

/**
 * Read the ledger back, skipping unparseable lines rather than failing the
 * whole read — a torn final line must not cost the rest of the record.
 */
export async function readLedger(sessionDir: string): Promise<LedgerEvent[]> {
  let raw: string;
  try {
    raw = await readFile(join(sessionDir, LEDGER_FILENAME), 'utf-8');
  } catch {
    return [];
  }

  const events: LedgerEvent[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed.type === 'string') {
        events.push(parsed);
      }
    } catch {
      // A line still being written when the session ended.
    }
  }
  return events;
}
