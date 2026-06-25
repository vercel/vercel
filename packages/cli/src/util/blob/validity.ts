import ms from 'ms';

interface ResolveValidUntilInput {
  validUntil: number | undefined;
  validFor: string | undefined;
}

type ResolveValidUntilResult =
  | { validUntil: number | undefined; error?: undefined }
  | { validUntil?: undefined; error: string };

export function resolveBlobValidUntil({
  validUntil,
  validFor,
}: ResolveValidUntilInput): ResolveValidUntilResult {
  if (validUntil !== undefined && validFor !== undefined) {
    return {
      error:
        'The --valid-until and --valid-for flags are mutually exclusive. Pass only one.',
    };
  }

  if (validFor === undefined) {
    return { validUntil };
  }

  const durationMs = ms(validFor);
  if (durationMs === undefined || durationMs <= 0) {
    return {
      error: `Invalid --valid-for value "${validFor}". Use values like "15m", "1h", or "7d".`,
    };
  }

  return { validUntil: Date.now() + durationMs };
}
