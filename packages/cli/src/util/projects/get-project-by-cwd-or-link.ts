import type Client from '../client';
import { ProjectNotFound } from '../errors-ts';
import {
  ensureLink,
  isProjectLinked,
  isProjectLinkedError,
  isProjectNotLinked,
} from '../link/ensure-link';
import getProjectByNameOrId from './get-project-by-id-or-name';
import type { Project, ProjectLinked } from '@vercel-internals/types';

export default async function getProjectByCwdOrLink({
  autoConfirm,
  client,
  commandName,
  cwd,
  projectNameOrId,
}: {
  autoConfirm?: boolean;
  client: Client;
  commandName: string;
  cwd?: string;
  projectNameOrId?: string;
}): Promise<Project> {
  if (projectNameOrId) {
    const project = await getProjectByNameOrId(client, projectNameOrId);
    if (project instanceof ProjectNotFound) {
      throw project;
    }
    return project;
  }

  // ensure the current directory is a linked project
  const linkedProject = await ensureLink(
    commandName,
    client,
    cwd ?? client.cwd,
    {
      autoConfirm,
    }
  );

  if (typeof linkedProject === 'number') {
    const err: NodeJS.ErrnoException = new Error('Link project error');
    err.code = 'ERR_LINK_PROJECT';
    throw err;
  }

  if (isProjectLinked(linkedProject)) {
    return (linkedProject as ProjectLinked).project;
  }

  if (isProjectNotLinked(linkedProject)) {
    throw new Error('Project not linked');
  }

  if (isProjectLinkedError(linkedProject)) {
    throw new Error('Project linked error');
  }

  throw new Error('Unknown error');
}
