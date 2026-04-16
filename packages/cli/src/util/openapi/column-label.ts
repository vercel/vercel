const LABEL_OVERRIDES: Record<string, string> = {
  createdAt: 'Created',
  updatedAt: 'Updated',
  deletedAt: 'Deleted',
  expiredAt: 'Expired',
  verifiedAt: 'Verified',
  deployedAt: 'Deployed',
  created_at: 'Created',
  updated_at: 'Updated',
  accountId: 'Account Id',
  projectId: 'Project Id',
  teamId: 'Team Id',
  nodeVersion: 'Node Version',
};

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
 * Common fields like `updatedAt` are mapped to shorter labels (e.g. "Updated").
 */
export function humanReadableColumnLabel(columnPath: string): string {
  const override = LABEL_OVERRIDES[columnPath];
  if (override) return override;

  const parts = columnPath.split('.').filter(Boolean);
  if (parts.length === 0) {
    return columnPath;
  }
  if (parts.length === 1) {
    return LABEL_OVERRIDES[parts[0]] ?? humanizeIdentifier(parts[0]);
  }
  return parts
    .map(p => LABEL_OVERRIDES[p] ?? humanizeIdentifier(p))
    .join(' › ');
}
