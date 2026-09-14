/**
 * The firewall config a command operates on: a project's config, or the
 * team-level config that applies to every project in the team (`--team-level`).
 */
export type FirewallScope =
  | { type: 'project'; projectId: string; teamId?: string; displayName: string }
  | { type: 'team'; teamId: string; displayName: string };

export function projectScope(
  project: { id: string; name: string },
  teamId: string | undefined
): FirewallScope {
  return {
    type: 'project',
    projectId: project.id,
    teamId,
    displayName: project.name,
  };
}

/**
 * Builds the firewall config endpoint URL for the scope. `path` is appended to
 * the config base, e.g. `/draft` or `/draft/activate`.
 */
export function firewallConfigUrl(scope: FirewallScope, path = ''): string {
  const query = new URLSearchParams();
  if (scope.type === 'project') {
    query.set('projectId', scope.projectId);
    if (scope.teamId) query.set('teamId', scope.teamId);
    return `/v1/security/firewall/config${path}?${query.toString()}`;
  }
  query.set('teamId', scope.teamId);
  return `/v1/security/firewall/team-config${path}?${query.toString()}`;
}
