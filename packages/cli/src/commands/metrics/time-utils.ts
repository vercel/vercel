import type { Granularity } from './types';

const RELATIVE_TIME_RE = /^(\d+)(m|h|d|w)$/;

const UNIT_TO_MS: Record<string, number> = {
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

export function parseTimeFlag(input: string): Date {
  const match = RELATIVE_TIME_RE.exec(input);
  if (match) {
    const [, amount, unit] = match;
    const ms = parseInt(amount, 10) * UNIT_TO_MS[unit];
    return new Date(Date.now() - ms);
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
  const match = RELATIVE_TIME_RE.exec(input);
  if (!match) {
    throw new Error(
      `Invalid granularity format "${input}". Use 1m, 5m, 15m, 1h, 4h, 1d.`
    );
  }
  const [, amount, unit] = match;
  const num = parseInt(amount, 10);
  switch (unit) {
    case 'm':
      return { minutes: num };
    case 'h':
      return { hours: num };
    case 'd':
      return { days: num };
    case 'w':
      return { days: num * 7 };
    default:
      throw new Error(`Unknown time unit "${unit}".`);
  }
}

export function toGranularityMs(input: string): number {
  const match = RELATIVE_TIME_RE.exec(input);
  if (!match) {
    throw new Error(`Invalid granularity format "${input}".`);
  }
  const [, amount, unit] = match;
  return parseInt(amount, 10) * UNIT_TO_MS[unit];
}

export interface GranularityResult {
  duration: Granularity;
  adjusted: boolean;
  notice?: string;
}

// Auto-granularity thresholds: [maxRangeMs, defaultGranularity, minGranularity]
const GRANULARITY_THRESHOLDS: [number, string, string][] = [
  [1 * 60 * 60 * 1000, '1m', '1m'], // ≤1h
  [2 * 60 * 60 * 1000, '5m', '5m'], // ≤2h
  [12 * 60 * 60 * 1000, '15m', '5m'], // ≤12h
  [3 * 24 * 60 * 60 * 1000, '1h', '1h'], // ≤3d
  [30 * 24 * 60 * 60 * 1000, '4h', '4h'], // ≤30d
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

  if (explicitMs < minMs) {
    const rangeDays = Math.round(rangeMs / (24 * 60 * 60 * 1000));
    const rangeHours = Math.round(rangeMs / (60 * 60 * 1000));
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
    return duration.minutes * 60 * 1000;
  }
  if ('hours' in duration) {
    return duration.hours * 60 * 60 * 1000;
  }
  return duration.days * 24 * 60 * 60 * 1000;
}
