/**
 * Normalize a route prefix to always have a leading slash and no trailing slash
 * unless it is root (`/`).
 */
export function normalizeRoutePrefix(routePrefix: string): string {
  let normalized = routePrefix.startsWith('/')
    ? routePrefix
    : `/${routePrefix}`;
  if (normalized !== '/' && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized || '/';
}

function escapeForRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}

function toPrefixMatcher(routePrefix: string): string {
  return `${escapeForRegex(routePrefix)}(?:/|$)`;
}

function isDescendantPrefix(candidate: string, prefix: string): boolean {
  return candidate !== prefix && candidate.startsWith(`${prefix}/`);
}

/**
 * Create a service ownership guard:
 * - Root services exclude all non-root prefixes.
 * - Non-root services are constrained to their prefix and exclude descendants.
 */
export function getOwnershipGuard(
  ownerPrefix: string,
  allRoutePrefixes: string[]
): string {
  const owner = normalizeRoutePrefix(ownerPrefix);
  const normalizedPrefixes = Array.from(
    new Set(allRoutePrefixes.map(normalizeRoutePrefix))
  );
  const nonRootPrefixes = normalizedPrefixes
    .filter(prefix => prefix !== '/')
    .sort((a, b) => b.length - a.length);

  if (owner === '/') {
    return nonRootPrefixes
      .map(prefix => `(?!${toPrefixMatcher(prefix)})`)
      .join('');
  }

  const descendants = nonRootPrefixes.filter(prefix =>
    isDescendantPrefix(prefix, owner)
  );
  const positive = `(?=${toPrefixMatcher(owner)})`;
  const negative = descendants
    .map(prefix => `(?!${toPrefixMatcher(prefix)})`)
    .join('');

  return `${positive}${negative}`;
}

export function scopeRouteSourceToOwnership(
  source: string,
  ownershipGuard: string
): string {
  if (!ownershipGuard) {
    return source;
  }
  const inner = source.startsWith('^') ? source.slice(1) : source;
  // Wrap with lookaheads/non-capturing group to preserve capture numbering.
  return `^${ownershipGuard}(?:${inner})`;
}
