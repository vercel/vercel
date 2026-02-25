import ms from 'ms';
import type { Granularity } from './types';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function parseTimeFlag(input: string): Date {
  const milliseconds = ms(input);
  if (milliseconds !== undefined) {
    return new Date(Date.now() - milliseconds);
  }
  const date = new Date(input);
  if (isNaN(date.getTime())) {
    throw new Error(
      `Invalid time format "${input}". Use relative (1h, 30m, 2d, 1w) or ISO 8601 datetime.`
    );
  }
  return date;
}

export function resolveTimeRange(
  since?: string,
  until?: string
): { startTime: Date; endTime: Date } {
  const startTime = parseTimeFlag(since ?? '1h');
  const endTime = until ? parseTimeFlag(until) : new Date();
  return { startTime, endTime };
}

export function toGranularityDuration(input: string): Granularity {
  const milliseconds = ms(input);
  if (milliseconds === undefined) {
    throw new Error(
      `Invalid granularity format "${input}". Use 1m, 5m, 15m, 1h, 4h, 1d.`
    );
  }
  if (milliseconds >= DAY_MS) {
    return { days: milliseconds / DAY_MS };
  }
  if (milliseconds >= HOUR_MS) {
    return { hours: milliseconds / HOUR_MS };
  }
  return { minutes: milliseconds / MINUTE_MS };
}

export function toGranularityMs(input: string): number {
  const milliseconds = ms(input);
  if (milliseconds === undefined) {
    throw new Error(`Invalid granularity format "${input}".`);
  }
  return milliseconds;
}

export interface GranularityResult {
  duration: Granularity;
  adjusted: boolean;
  notice?: string;
}

// Auto-granularity thresholds: [maxRangeMs, defaultGranularity, minGranularity]
const GRANULARITY_THRESHOLDS: [number, string, string][] = [
  [1 * HOUR_MS, '1m', '1m'], // ≤1h
  [2 * HOUR_MS, '5m', '5m'], // ≤2h
  [12 * HOUR_MS, '15m', '5m'], // ≤12h
  [3 * DAY_MS, '1h', '1h'], // ≤3d
  [30 * DAY_MS, '4h', '4h'], // ≤30d
];
const FALLBACK_GRANULARITY = '1d';

export function getAutoGranularity(rangeMs: number): string {
  for (const [maxRange, defaultG] of GRANULARITY_THRESHOLDS) {
    if (rangeMs <= maxRange) {
      return defaultG;
    }
  }
  return FALLBACK_GRANULARITY;
}

function getMinGranularity(rangeMs: number): string {
  for (const [maxRange, , minG] of GRANULARITY_THRESHOLDS) {
    if (rangeMs <= maxRange) {
      return minG;
    }
  }
  return FALLBACK_GRANULARITY;
}

/**
 * Determines the query granularity (time bucket size).
 * - If no explicit value is provided, auto-selects based on the time range
 *   (e.g. 1m for ≤1h, 1h for ≤3d — see GRANULARITY_THRESHOLDS).
 * - If the user provides a value, validates it against the minimum allowed for
 *   the range and adjusts upward if too fine (e.g. 1m over 30 days → 4h).
 *   When adjusted, `adjusted: true` is returned so callers can notify the user.
 */
export function computeGranularity(
  rangeMs: number,
  explicit?: string
): GranularityResult {
  if (!explicit) {
    const auto = getAutoGranularity(rangeMs);
    return {
      duration: toGranularityDuration(auto),
      adjusted: false,
    };
  }

  const minG = getMinGranularity(rangeMs);
  const explicitMs = toGranularityMs(explicit);
  const minMs = toGranularityMs(minG);

  // User's granularity is too fine for this range — bump up to the minimum
  if (explicitMs < minMs) {
    const rangeDays = Math.round(rangeMs / DAY_MS);
    const rangeHours = Math.round(rangeMs / HOUR_MS);
    const rangeLabel =
      rangeDays >= 1 ? `${rangeDays}-day` : `${rangeHours}-hour`;
    return {
      duration: toGranularityDuration(minG),
      adjusted: true,
      notice: `Granularity adjusted from ${explicit} to ${minG} for a ${rangeLabel} time range.`,
    };
  }

  return {
    duration: toGranularityDuration(explicit),
    adjusted: false,
  };
}

/**
 * Floors start and ceils end to the nearest granularity boundary so every
 * time bucket covers the full granularity interval. Without rounding,
 * the first and last buckets could be shorter than the rest
 * (e.g. 1h buckets over 14:23–16:47 would produce a 37-min first bucket
 * and a 47-min last bucket). Rounding to 14:00–17:00 ensures all three
 * buckets are full 1-hour intervals.
 */
export function roundTimeBoundaries(
  start: Date,
  end: Date,
  granularityMs: number
): { start: Date; end: Date } {
  const flooredStart = new Date(
    Math.floor(start.getTime() / granularityMs) * granularityMs
  );
  const ceiledEnd = new Date(
    Math.ceil(end.getTime() / granularityMs) * granularityMs
  );
  return { start: flooredStart, end: ceiledEnd };
}

export function toGranularityMsFromDuration(duration: Granularity): number {
  if ('minutes' in duration) {
    return duration.minutes * MINUTE_MS;
  }
  if ('hours' in duration) {
    return duration.hours * HOUR_MS;
  }
  return duration.days * DAY_MS;
}
