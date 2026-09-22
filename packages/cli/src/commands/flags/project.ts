import type Client from '../../util/client';
import {
  resolveProjectContext,
  type ResolveProjectContextOptions,
} from '../../util/projects/resolve-project-context';

export function getProjectNameFromFlags(flags: {
  [key: string]: unknown;
}): string | undefined {
  return flags['--project'] as string | undefined;
}

export function getLinkedFlagsProject(
  client: Client,
  projectName?: string,
  options?: Pick<ResolveProjectContextOptions, 'projectNotFoundHandling'>
) {
  return resolveProjectContext({
    client,
    projectNameOrId: projectName,
    projectNotFoundHandling: options?.projectNotFoundHandling,
  });
}
