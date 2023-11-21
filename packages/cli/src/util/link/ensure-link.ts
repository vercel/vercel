import Client from '../client.js';
import setupAndLink from '../link/setup-and-link.js';
import param from '../output/param.js';
import { getCommandName } from '../pkg-name.js';
import { getLinkedProject } from '../projects/link.js';
import type { SetupAndLinkOptions } from '../link/setup-and-link.js';
import type { ProjectLinked } from '@vercel-internals/types';

/**
 * Checks if a project is already linked and if not, links the project and
 * validates the link response.
 *
 * @param commandName - The name of the current command to print in the
 * event of an error
 * @param client - The Vercel Node.js client instance
 * @param cwd - The current working directory
 * @param opts.forceDelete - When `true`, deletes the project's `.vercel`
 * directory
 * @param opts.projectName - The project name to use when linking, otherwise
 * the current directory
 * @returns {Promise<ProjectLinked|number>} Returns a numeric exit code when aborted or
 * error, otherwise an object containing the org an project
 */
export async function ensureLink(
  commandName: string,
  client: Client,
  cwd: string,
  opts: SetupAndLinkOptions = {}
): Promise<ProjectLinked | number> {
  let { link } = opts;
  if (!link) {
    link = await getLinkedProject(client, cwd);
    opts.link = link;
  }

  if (
    (link.status === 'linked' && opts.forceDelete) ||
    link.status === 'not_linked'
  ) {
    link = await setupAndLink(client, cwd, opts);

    if (link.status === 'not_linked') {
      // User aborted project linking questions
      return 0;
    }
  }

  if (link.status === 'error') {
    if (link.reason === 'HEADLESS') {
      client.output.error(
        `Command ${getCommandName(
          commandName
        )} requires confirmation. Use option ${param('--yes')} to confirm.`
      );
    }
    return link.exitCode;
  }

  return link;
}
