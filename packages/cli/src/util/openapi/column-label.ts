/**
 * Turn a single identifier segment (camelCase, snake_case, kebab-case, etc.)
 * into Title Case words.
 */
export function humanizeIdentifier(raw: string): string {
  const s = raw.trim();
  if (!s) {
    return raw;
  }
  const withSpaces = s
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  const words = withSpaces.split(/[\s_-]+/).filter(Boolean);
  return words
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Human-readable label for a column dot-path: each segment is humanized,
 * segments joined with ` › ` (e.g. `softBlock.blockedAt` → `Soft Block › Blocked At`).
 */
export function humanReadableColumnLabel(columnPath: string): string {
  const parts = columnPath.split('.').filter(Boolean);
  if (parts.length === 0) {
    return columnPath;
  }
  return parts.map(humanizeIdentifier).join(' › ');
}
