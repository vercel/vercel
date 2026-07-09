/**
 * Limit/quota API errors can carry a plan-appropriate call to action chosen by
 * the backend — the newer `ctaLabel`/`ctaUrl` pair, or the legacy `action`/
 * `link` pair. Extract it as a pair so we never mix a new label with a legacy
 * URL (or vice versa). Returns `undefined` when neither complete pair is present
 * so callers can fall back.
 */
export function getErrorCta(source: {
  ctaLabel?: unknown;
  ctaUrl?: unknown;
  action?: unknown;
  link?: unknown;
}): { label: string; url: string } | undefined {
  if (
    typeof source.ctaLabel === 'string' &&
    typeof source.ctaUrl === 'string'
  ) {
    return { label: source.ctaLabel, url: source.ctaUrl };
  }
  if (typeof source.action === 'string' && typeof source.link === 'string') {
    return { label: source.action, url: source.link };
  }
  return undefined;
}
