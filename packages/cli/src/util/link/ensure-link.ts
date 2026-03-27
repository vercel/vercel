import type Client from '../client';
import setupAndLink from '../link/setup-and-link';
import param from '../output/param';
import { getCommandName, getCommandNamePlain } from '../pkg-name';
import { getLinkedProject } from '../projects/link';
import { resolveProjectCwd } from '../projects/find-project-root';
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
 * Delegates to link-2 for the linking flow. If you need the legacy
 * setupAndLink behaviour (e.g. to avoid a circular dependency), use
 * {@link ensureLinkLegacy} instead.
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
  cwd = await resolveProjectCwd(cwd);

  let { link } = opts;
  const nonInteractive = opts.nonInteractive ?? client.nonInteractive ?? false;
  opts.nonInteractive = nonInteractive;
  if (!link) {
    if (opts.forceDelete) {
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
    const link2 = (await import('../../commands/link-2/index.js')).default;

    const savedArgv = client.argv;
    const savedCwd = client.cwd;
    const linkArgv = [savedArgv[0], savedArgv[1], 'link'];
    if (opts.autoConfirm) linkArgv.push('--yes');
    if (opts.projectName) linkArgv.push('--project', opts.projectName);
    client.argv = linkArgv;
    client.cwd = cwd;

    try {
      const exitCode = await link2(client);
      if (exitCode !== 0) {
        return exitCode;
      }
    } finally {
      client.argv = savedArgv;
      client.cwd = savedCwd;
    }

    link = await getLinkedProject(client, cwd);
    if (link.status === 'not_linked') {
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

/**
 * Legacy ensureLink that uses setupAndLink directly.
 * Used by link-2's no-repo fallback to avoid circular dependency.
 */
export async function ensureLinkLegacy(
  commandName: string,
  client: Client,
  cwd: string,
  opts: SetupAndLinkOptions = {}
): Promise<ProjectLinked | number> {
  cwd = await resolveProjectCwd(cwd);

  let { link } = opts;
  const nonInteractive = opts.nonInteractive ?? client.nonInteractive ?? false;
  opts.nonInteractive = nonInteractive;
  if (!link) {
    if (opts.forceDelete) {
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
