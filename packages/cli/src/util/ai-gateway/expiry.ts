/**
 * Optional expiry for AI Gateway API keys. The API accepts an `expiresAt` Unix
 * millisecond timestamp at creation only. These presets mirror the dashboard's
 * "AI Gateway → New API Key" expiry options so the two surfaces stay in sync.
 */
export const EXPIRY_PRESETS = [
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: '60 days', value: '60d' },
  { label: '90 days', value: '90d' },
  { label: '1 year', value: '1y' },
] as const;

export type ExpiryPreset = (typeof EXPIRY_PRESETS)[number]['value'];

/** Default highlighted option once the user opts into an expiry. */
export const DEFAULT_EXPIRY_PRESET: ExpiryPreset = '30d';

/** Accepted `--expiration` values: any preset, or `none` for no expiry. */
export const VALID_EXPIRY_VALUES = [
  ...EXPIRY_PRESETS.map(p => p.value),
  'none',
] as const;

export function isValidExpiry(value: string): boolean {
  return (VALID_EXPIRY_VALUES as readonly string[]).includes(value);
}

const DAY_MS = 86_400_000;

/**
 * Resolves a preset to an absolute `expiresAt` timestamp (ms), or `undefined`
 * for `none`. Day presets add fixed 24h spans; `1y` adds a calendar year, both
 * matching the dashboard.
 */
export function presetToExpiresAt(
  value: string,
  now: number = Date.now()
): number | undefined {
  switch (value) {
    case '7d':
      return now + 7 * DAY_MS;
    case '30d':
      return now + 30 * DAY_MS;
    case '60d':
      return now + 60 * DAY_MS;
    case '90d':
      return now + 90 * DAY_MS;
    case '1y': {
      const date = new Date(now);
      date.setFullYear(date.getFullYear() + 1);
      return date.getTime();
    }
    default:
      return undefined;
  }
}
