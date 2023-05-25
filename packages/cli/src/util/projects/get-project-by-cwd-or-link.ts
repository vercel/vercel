import type Client from '../client';
import { ProjectNotFound } from '../errors-ts';
import { ensureLink } from '../link/ensure-link';
import validatePaths from '../validate-paths';
import getProjectByNameOrId from './get-project-by-id-or-name';
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

  const pathValidation = await validatePaths(client, [cwd]);
  if (!pathValidation.valid) {
    if (pathValidation.exitCode) {
      const err: NodeJS.ErrnoException = new Error(
        'Invalid current working directory'
      );
      err.code = 'ERR_INVALID_CWD';
      throw err;
    }
    const err: NodeJS.ErrnoException = new Error('Canceled');
    err.code = 'ERR_CANCELED';
    throw err;
  }

  // ensure the current directory is a linked project
  const linkedProject = await ensureLink(
    commandName,
    client,
    pathValidation.path,
    { autoConfirm }
  );

  if (typeof linkedProject === 'number') {
    const err: NodeJS.ErrnoException = new Error('Link project error');
    err.code = 'ERR_LINK_PROJECT';
    throw err;
  }

  return linkedProject.project;
}
