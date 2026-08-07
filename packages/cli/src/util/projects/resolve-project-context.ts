import type Client from '../client';
import { omitGlobalFlagsFromArgs } from '../agent-output';
import { detectExplicitScope } from '../get-scope';
import { getLinkedProject, type ProjectLinkResultWithOrgId } from './link';
import { printProjectNotFoundError } from './project-not-found-error';

export interface ResolveProjectContextOptions {
  client: Client;
  cwd?: string;
  projectNameOrId?: string;
  commandName?: string;
  /**
   * Controls who handles an unresolved explicit project. `report` emits the
   * standard project-not-found error; `return` leaves the result as
   * `not_linked` so the caller can provide its own output.
   *
   * @default 'report'
   */
  projectNotFoundHandling?: 'report' | 'return';
}

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
 * Resolves project context without linking the directory or creating a project.
 */
export async function resolveProjectContext({
  client,
  cwd = client.cwd,
  projectNameOrId,
  commandName = '',
  projectNotFoundHandling = 'report',
}: ResolveProjectContextOptions): Promise<ProjectLinkResultWithOrgId> {
  const context = await getLinkedProject(client, {
    cwd,
    projectName: projectNameOrId,
    projectNameIsExplicit: Boolean(projectNameOrId),
    scopeIsExplicit: detectExplicitScope(client),
  });

  if (
    context.status === 'not_linked' &&
    projectNameOrId &&
    projectNotFoundHandling === 'report'
  ) {
    await printProjectNotFoundError(
      client,
      projectNameOrId,
      commandName || getInvokingCommandFromArgv(client.argv),
      context.orgId
    );
    return { status: 'error', exitCode: 1, orgId: context.orgId };
  }

  return context;
}
