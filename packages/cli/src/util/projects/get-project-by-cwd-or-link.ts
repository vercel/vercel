import type Client from '../client';
import { LinkRequiredError, ProjectNotFound } from '../errors-ts';
import { argvHasNonInteractive } from '../agent-output';
import { ensureLink } from '../link/ensure-link';
import { resolveProjectCwd } from './find-project-root';
import { getLinkedProject } from './link';
import getProjectByNameOrId from './get-project-by-id-or-name';
import type { Project } from '@vercel-internals/types';

export default async function getProjectByCwdOrLink({
  autoConfirm,
  nonInteractive,
  client,
  commandName,
  cwd,
  projectNameOrId,
  forReadOnlyCommand,
}: {
  autoConfirm?: boolean;
  nonInteractive?: boolean;
  client: Client;
  commandName: string;
  cwd?: string;
  projectNameOrId?: string;
  /**
   * When true with non-interactive mode, resolve the project only from an
   * existing link (or env). Never run interactive `setupAndLink` / `--yes`
   * (read-only commands do not accept `--yes`).
   */
  forReadOnlyCommand?: boolean;
}): Promise<Project> {
  if (projectNameOrId) {
    const project = await getProjectByNameOrId(client, projectNameOrId);
    if (project instanceof ProjectNotFound) {
      throw project;
    }
    return project;
  }

  const effectiveNonInteractive =
    nonInteractive ??
    client.nonInteractive ??
    argvHasNonInteractive(client.argv);

  if (forReadOnlyCommand && effectiveNonInteractive) {
    const resolvedCwd = await resolveProjectCwd(cwd ?? client.cwd);
    const link = await getLinkedProject(client, resolvedCwd);
    if (link.status === 'linked' && link.project) {
      return link.project;
    }
    if (link.status === 'error') {
      const err: NodeJS.ErrnoException = new Error('Link project error');
      err.code = 'ERR_LINK_PROJECT';
      throw err;
    }
    throw new LinkRequiredError();
  }

  // Non-interactive resolution (explicit name, env, `.vercel`, repo link, or
  // unambiguous auto-detect) lives in `ensureLink` / `setupAndLink` / `inputProject`
  // so we emit structured `outputActionRequired` where appropriate instead of
  // throwing here. See docs/non-interactive-mode.md.

  // ensure the current directory is a linked project
  const linkedProject = await ensureLink(
    commandName,
    client,
    cwd ?? client.cwd,
    {
      autoConfirm,
      nonInteractive,
    }
  );

  if (typeof linkedProject === 'number') {
    const err: NodeJS.ErrnoException = new Error('Link project error');
    err.code = 'ERR_LINK_PROJECT';
    throw err;
  }

  return linkedProject.project;
}
