import type Client from '../client.js';
import { ProjectNotFound } from '../errors-ts.js';
import { ensureLink } from '../link/ensure-link.js';
import getProjectByNameOrId from './get-project-by-id-or-name.js';
import type { Project } from '@vercel-internals/types';

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
  cwd: string;
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
  const linkedProject = await ensureLink(commandName, client, cwd, {
    autoConfirm,
  });

  if (typeof linkedProject === 'number') {
    const err: NodeJS.ErrnoException = new Error('Link project error');
    err.code = 'ERR_LINK_PROJECT';
    throw err;
  }

  return linkedProject.project;
}
