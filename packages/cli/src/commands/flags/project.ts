import type Client from '../../util/client';
import { resolveProjectContext } from '../../util/projects/resolve-project-context';

export function getProjectNameFromFlags(flags: {
  [key: string]: unknown;
}): string | undefined {
  return flags['--project'] as string | undefined;
}

export function getLinkedFlagsProject(client: Client, projectName?: string) {
  return resolveProjectContext({
    client,
    projectNameOrId: projectName,
  });
}
