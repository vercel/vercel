/**
 * Value-ranked bytecode packing: select `.pyc` files to maximise compile
 * time avoided at cold start.
 *
 * Modules imported at startup (static import closure) rank first, then
 * everything else, both ordered by compile seconds per byte.
 *
 * Fallbacks: no closure -> compile density only; no timings -> size desc.
 * Every fallback is at least as good as the old per-package size knapsack.
 */

import type { Files } from '@vercel/build-utils';
import type { BytecodeItem } from './compileall';

/**
 * Kill switch for the import closure and timing-based ranking, set to
 * `1`/`true`. Selection falls back to per-file size ordering; bytecode
 * still ships.
 */
export function isBytecodeAnalysisDisabled(): boolean {
  const val = process.env.VERCEL_PYTHON_DISABLE_BYTECODE_ANALYSIS;
  if (val === undefined || val === '') return false;

  const lower = val.toLowerCase();
  return lower === '1' || lower === 'true';
}

export interface RankedBytecodeItem extends BytecodeItem {
  imported: boolean;
  /** Compile seconds for the source file; undefined when timings are missing. */
  compileSeconds?: number;
}

/**
 * Attach import-closure membership and compile timings to collected items.
 */
export function annotateBytecodeItems(
  items: BytecodeItem[],
  importedModules: ReadonlySet<string> | undefined,
  timings: ReadonlyMap<string, number> | undefined
): RankedBytecodeItem[] {
  return items.map(item => ({
    ...item,
    imported: importedModules?.has(item.moduleKey) ?? false,
    compileSeconds: timings?.get(item.sourceAbsPath),
  }));
}

/**
 * Order items best-first for greedy filling.
 *
 * Sort keys, in order:
 * - imported first (only when the closure ran — otherwise all items are
 *   unimported and the key is inert)
 * - compile density (seconds per byte) desc; items without a timing take
 *   the median density so they rank by size among equals
 * - size desc
 */
export function rankBytecodeItems(
  items: RankedBytecodeItem[]
): RankedBytecodeItem[] {
  const densities = items
    .filter(i => i.compileSeconds != null && i.size > 0)
    .map(i => (i.compileSeconds as number) / i.size)
    .sort((a, b) => a - b);
  const medianDensity =
    densities.length > 0 ? densities[Math.floor(densities.length / 2)] : null;

  return [...items].sort((a, b) => {
    if (a.imported !== b.imported) return a.imported ? -1 : 1;
    if (medianDensity !== null) {
      const da =
        a.compileSeconds != null && a.size > 0
          ? a.compileSeconds / a.size
          : medianDensity;
      const db =
        b.compileSeconds != null && b.size > 0
          ? b.compileSeconds / b.size
          : medianDensity;
      if (da !== db) return db - da;
    }
    return b.size - a.size;
  });
}

/**
 * Greedy fill: add ranked items to `files` while they fit the capacity,
 * skipping items that don't (a small file may still fit after a large one
 * is skipped). Returns the remaining capacity.
 */
export function fillBytecodeWithinCapacity(
  files: Files,
  rankedItems: RankedBytecodeItem[],
  capacity: number
): number {
  let remaining = capacity;
  for (const item of rankedItems) {
    if (remaining <= 0) break;
    if (item.size <= remaining) {
      files[item.bundlePath] = item.file;
      remaining -= item.size;
    }
  }
  return remaining;
}
