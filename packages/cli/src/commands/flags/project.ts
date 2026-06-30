import type Client from '../../util/client';
import { getLinkedProject } from '../../util/projects/link';

export function getProjectNameFromFlags(flags: {
  [key: string]: unknown;
}): string | undefined {
  return flags['--project'] as string | undefined;
}

export function getLinkedFlagsProject(client: Client, projectName?: string) {
  return getLinkedProject(
    client,
    client.cwd,
    projectName,
    Boolean(projectName)
  );
}
