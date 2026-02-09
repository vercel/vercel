import type Client from '../client';
import setupAndLink from '../link/setup-and-link';
import param from '../output/param';
import { getCommandName } from '../pkg-name';
import { getLinkedProject } from '../projects/link';
import type { SetupAndLinkOptions } from '../link/setup-and-link';
import type { ProjectLinked } from '@vercel-internals/types';
import { outputActionRequired } from '../agent-output';
import output from '../../output-manager';

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
 * @returns {Promise<ProjectLinked>} The linked project (or the process exits)
 */
export async function ensureLink(
  commandName: string,
  client: Client,
  cwd: string,
  opts: SetupAndLinkOptions = {}
): Promise<ProjectLinked> {
  let { link } = opts;
  if (!link) {
    link = await getLinkedProject(client, cwd);
    opts.link = link;
  }

  if (
    (link.status === 'linked' && opts.forceDelete) ||
    link.status === 'not_linked'
  ) {
    const result = await setupAndLink(client, cwd, opts);

    if (
      typeof result === 'object' &&
      result !== null &&
      'status' in result &&
      result.status === 'action_required'
    ) {
      outputActionRequired(client, result);
      process.exit(1);
    }

    if (result.status === 'not_linked') {
      // User aborted project linking questions
      process.exit(0);
    }
    link = result;
  }

  if (link.status === 'error') {
    if (link.reason === 'HEADLESS') {
      output.error(
        `Command ${getCommandName(
          commandName
        )} requires confirmation. Use option ${param('--yes')} to confirm.`
      );
    }
    process.exit(link.exitCode);
  }

  return link;
}
