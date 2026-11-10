const OBSERVABILITY_PLUS_ADDON_ALIASES = new Set([
  'observability',
  'observabilityplus',
  'observability-plus',
  'observability_plus',
]);

export function isObservabilityPlusAddonAlias(name: string): boolean {
  return OBSERVABILITY_PLUS_ADDON_ALIASES.has(name.toLowerCase());
}
