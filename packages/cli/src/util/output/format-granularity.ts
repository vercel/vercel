export type GranularityLike =
  | { minutes: number }
  | { hours: number }
  | { days: number };

export function formatGranularity(value: GranularityLike): string;
export function formatGranularity(value: unknown): string | undefined;
export function formatGranularity(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const granularity = value as Record<string, unknown>;
  if (typeof granularity.minutes === 'number') {
    return `${granularity.minutes}m`;
  }
  if (typeof granularity.hours === 'number') {
    return `${granularity.hours}h`;
  }
  if (typeof granularity.days === 'number') {
    return `${granularity.days}d`;
  }

  return undefined;
}
