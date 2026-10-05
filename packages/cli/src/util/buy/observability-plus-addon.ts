export const OBSERVABILITY_PLUS_PRICING: [string, string][] = [
  ['Standard price', '$1.20 per 1 million events (USD)'],
  ['Usage', 'Billed as accrued'],
  [
    'Pricing',
    'https://vercel.com/docs/observability/observability-plus#pricing',
  ],
];

const OBSERVABILITY_PLUS_ADDON_ALIASES = new Set([
  'observability',
  'observabilityplus',
  'observability-plus',
  'observability_plus',
]);

export function isObservabilityPlusAddonAlias(name: string): boolean {
  return OBSERVABILITY_PLUS_ADDON_ALIASES.has(name.toLowerCase());
}
