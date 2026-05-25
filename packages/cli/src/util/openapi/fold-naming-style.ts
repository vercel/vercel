/**
 * Collapses camelCase, kebab-case, and snake_case to a single lowercase string
 * so identifiers that differ only by naming style compare equal, e.g.:
 * `project-routes`, `project_routes`, `projectRoutes`, `ProjectRoutes`.
 */
export function foldNamingStyle(input: string): string {
  return input
    .trim()
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/[-_\s]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

/**
 * Display form for `--describe`: normalize operationId to kebab-case (e.g. `getAuthUser` → `get-auth-user`).
 */
export function operationIdToKebabCase(operationId: string): string {
  const s = operationId.trim();
  if (!s) {
    return 'unnamed';
  }
  return s
    .replace(/([a-z\d])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/[-_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}
