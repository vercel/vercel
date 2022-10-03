import { Org, Project } from '../types';
import Client from './client';
import setupAndLink from './link/setup-and-link';
import param from './output/param';
import { getCommandName } from './pkg-name';
import { getLinkedProject } from './projects/link';

type LinkOpts = {
  forceDelete?: boolean;
  projectName?: string;
};

type LinkResult = {
  org: Org;
  project: Project;
};

/**
 * Checks if a project is already linked and if not, links the project and
 * validates the link response.
 *
 * @param commandName - The name of the current command to print in the
 * event of an error
 * @param client - The Vercel Node.js client instance
 * @param cwd - The current working directory
 * @param yes - When `true`, skips questions when setting up new project
 * @param opts.forceDelete - When `true`, deletes the project's `.vercel`
 * directory
 * @param opts.projectName - The project name to use when linking, otherwise
 * the current directory
 * @returns {LinkResult|number} Returns a numeric exit code when aborted or
 * error, otherwise an object containing the org an project
 */
export async function ensureLink(
  commandName: string,
  client: Client,
  cwd: string,
  yes: boolean,
  opts?: LinkOpts
): Promise<LinkResult | number> {
  let link = await getLinkedProject(client, cwd);
  if (link.status === 'not_linked') {
    link = await setupAndLink(client, cwd, {
      autoConfirm: yes,
      successEmoji: 'link',
      setupMsg: 'Set up',
      ...opts,
    });

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

  return { org: link.org, project: link.project };
}
