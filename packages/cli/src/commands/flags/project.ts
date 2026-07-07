import type Client from '../../util/client';
import { getLinkedProjectOrFail } from '../../util/projects/get-linked-project-or-fail';

export function getProjectNameFromFlags(flags: {
  [key: string]: unknown;
}): string | undefined {
  return flags['--project'] as string | undefined;
}

export function getLinkedFlagsProject(client: Client, projectName?: string) {
  return getLinkedProjectOrFail(client, projectName);
}
