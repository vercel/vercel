import type Client from '../client';
import setupAndLink from '../link/setup-and-link';
import param from '../output/param';
import { getCommandName } from '../pkg-name';
import { getLinkedProject } from '../projects/link';
import type { SetupAndLinkOptions } from '../link/setup-and-link';
import type {
  ProjectLinked,
  ProjectNotLinked,
  ProjectLinkedError,
} from '@vercel-internals/types';
import {
  type ActionRequiredPayload,
  outputActionRequired,
} from '../agent-output';
import output from '../../output-manager';

type ProjectLinkResult =
  | ProjectLinked
  | ProjectNotLinked
  | ActionRequiredPayload
  | ProjectLinkedError
  | number
  | undefined;

export function isProjectLinked(link: ProjectLinkResult): boolean {
  return (
    typeof link === 'object' &&
    link !== null &&
    'status' in link &&
    link.status === 'linked'
  );
}

export function isProjectNotLinked(link: ProjectLinkResult): boolean {
  return (
    typeof link === 'object' &&
    link !== null &&
    'status' in link &&
    link.status === 'not_linked'
  );
}

export function isProjectLinkActionRequired(link: ProjectLinkResult): boolean {
  return (
    typeof link === 'object' &&
    link !== null &&
    'status' in link &&
    link.status === 'action_required'
  );
}

export function isProjectLinkedError(link: ProjectLinkResult): boolean {
  return (
    typeof link === 'object' &&
    link !== null &&
    'status' in link &&
    link.status === 'error'
  );
}

/**
 * Checks if a project is already linked and if not, links the project and
 * validates the link response. Exits (process.exit) when the user aborts,
 * when an error occurs, or when non-interactive and scope/project choice is
 * required; otherwise returns the linked project.
 *
 * @param commandName - The name of the current command to print in the
 * event of an error
 * @param client - The Vercel Node.js client instance
 * @param cwd - The current working directory
 * @param opts.forceDelete - When `true`, deletes the project's `.vercel`
 * directory
 * @param opts.projectName - The project name to use when linking, otherwise
 * the current directory
 * @returns {Promise<ProjectLinkResult>} The linked project (or the process exits)
 */
export async function ensureLink(
  commandName: string,
  client: Client,
  cwd: string,
  opts: SetupAndLinkOptions = {}
): Promise<ProjectLinkResult> {
  let { link } = opts;
  const nonInteractive = opts.nonInteractive ?? false;
  if (!link) {
    link = await getLinkedProject(client, cwd);
    opts.link = link;
  }

  if ((isProjectLinked(link) && opts.forceDelete) || isProjectNotLinked(link)) {
    link = (await setupAndLink(client, cwd, opts)) as ProjectLinkResult;

    if (link && isProjectLinkActionRequired(link)) {
      outputActionRequired(client, link);
      process.exit(1);
    }
    if (isProjectNotLinked(link)) {
      // User aborted project linking questions
      process.exit(0);
    }
  }

  if (isProjectLinkedError(link)) {
    if (link.reason === 'HEADLESS') {
      output.error(
        `Command ${getCommandName(
          commandName
        )} requires confirmation. Use option ${param('--yes')} to confirm.`
      );
    }
    if (nonInteractive) {
      process.exit(link.exitCode);
    }
    return link;
  }

  return link;
}
