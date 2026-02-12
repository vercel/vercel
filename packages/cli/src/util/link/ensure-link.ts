import type Client from '../client';
import setupAndLink from '../link/setup-and-link';
import param from '../output/param';
import { getCommandName, getCommandNamePlain } from '../pkg-name';
import { getLinkedProject } from '../projects/link';
import type { SetupAndLinkOptions } from '../link/setup-and-link';
import type { ProjectLinked } from '@vercel-internals/types';
import output from '../../output-manager';
import { outputActionRequired, buildCommandWithYes } from '../agent-output';

/**
 * Checks if a project is already linked and if not, links the project and
 * validates the link response. When non-interactive and an error occurs,
 * exits (process.exit); otherwise returns the linked project or a numeric
 * exit code (0 for user abort, non-zero for error).
 *
 * @param commandName - The name of the current command to print in the
 * event of an error
 * @param client - The Vercel Node.js client instance
 * @param cwd - The current working directory
 * @param opts.forceDelete - When `true`, deletes the project's `.vercel`
 * directory
 * @param opts.projectName - The project name to use when linking, otherwise
 * the current directory
 * @returns {Promise<ProjectLinked | number>} The linked project or exit code (or process exits when nonInteractive and error)
 */
export async function ensureLink(
  commandName: string,
  client: Client,
  cwd: string,
  opts: SetupAndLinkOptions = {}
): Promise<ProjectLinked | number> {
  let { link } = opts;
  // All commands respect global --non-interactive; link can override via opts
  const nonInteractive = opts.nonInteractive ?? client.nonInteractive ?? false;
  opts.nonInteractive = nonInteractive;
  if (!link) {
    if (opts.forceDelete) {
      // When `forceDelete` is enabled we will always run the interactive
      // setup/link flow. Avoid an eager `getLinkedProject()` call, since it can
      // trigger additional prompts (for example when `.vercel/repo.json` exists
      // and the repo-linked project is ambiguous).
      link = { status: 'not_linked', org: null, project: null };
    } else {
      link = await getLinkedProject(client, cwd);
    }
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
      if (nonInteractive) {
        outputActionRequired(
          client,
          {
            status: 'action_required',
            reason: 'confirmation_required',
            message: `Command ${getCommandNamePlain(commandName)} requires confirmation. Use option --yes to confirm.`,
            next: [
              {
                command: buildCommandWithYes(client.argv),
                when: 'Confirm and run',
              },
            ],
          },
          link.exitCode
        );
      } else {
        output.error(
          `Command ${getCommandName(
            commandName
          )} requires confirmation. Use option ${param('--yes')} to confirm.`
        );
      }
    }
    if (nonInteractive) {
      process.exit(link.exitCode);
    }
    return link.exitCode;
  }

  return link;
}
