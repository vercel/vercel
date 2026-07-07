import type Client from '../client';
import type { ProjectLinkResult } from '@vercel-internals/types';
import { omitGlobalFlagsFromArgs } from '../agent-output';
import { getLinkedProject } from './link';
import { printProjectNotFoundError } from './project-not-found-error';

/**
 * Returns the invoking command path (e.g. `flags ls`) from argv: the leading
 * positional tokens once global flags are removed. Used to build a runnable
 * retry command in the "project not found" suggestion.
 */
function getInvokingCommandFromArgv(argv: string[]): string {
  const args = omitGlobalFlagsFromArgs(argv.slice(2));
  const positionals: string[] = [];
  for (const arg of args) {
    if (arg.startsWith('-')) {
      break;
    }
    positionals.push(arg);
  }
  return positionals.join(' ');
}

/**
 * Resolves the project for commands that accept `--project` outside a linked
 * directory.
 *
 * When an explicit `--project` name fails to resolve, this reports the
 * standard "project not found" error (including the structured
 * non-interactive payload) instead of returning `not_linked` — the generic
 * "pass --project or run vercel link" guidance would tell the caller to pass
 * the flag they already passed.
 */
export async function getLinkedProjectOrFail(
  client: Client,
  projectName?: string
): Promise<ProjectLinkResult> {
  const link = await getLinkedProject(
    client,
    client.cwd,
    projectName,
    Boolean(projectName)
  );

  if (link.status === 'not_linked' && projectName) {
    await printProjectNotFoundError(
      client,
      projectName,
      getInvokingCommandFromArgv(client.argv)
    );
    return { status: 'error', exitCode: 1 };
  }

  return link;
}
