export function formatStoreLabel(name: string, id: string): string {
  return `${name} (${id})`;
}

export function formatConnectedProjects(
  connections: { project: { name: string } }[]
): string {
  if (connections.length === 0) {
    return '';
  }

  const MAX_SHOWN = 2;
  const shown = connections
    .slice(0, MAX_SHOWN)
    .map(c => c.project.name)
    .join(', ');
  const remaining = connections.length - MAX_SHOWN;

  if (remaining > 0) {
    return ` This store is connected to ${shown} and ${remaining} other project${remaining > 1 ? 's' : ''}.`;
  }

  return ` This store is connected to ${shown}.`;
}
