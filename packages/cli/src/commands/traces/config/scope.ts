import type Client from '../../../util/client';
import output from '../../../output-manager';
import { detectExplicitScope } from '../../../util/get-scope';
import { resolveProjectContext } from '../../../util/projects/resolve-project-context';
import { MISSING_BOTH_MESSAGE } from '../scope-resolver';
import {
  buildCommandWithGlobalFlags,
  outputActionRequired,
} from '../../../util/agent-output';
import {
  AGENT_REASON,
  AGENT_STATUS,
} from '../../../util/agent-output-constants';
import { invalidArguments } from './errors';

export type ConfigScope =
  | { teamId: string; projectId: string; projectName: string }
  | { exitCode: number };

export async function resolveConfigScope(
  client: Client,
  flags: { project?: string }
): Promise<ConfigScope> {
  const link = await resolveProjectContext({
    client,
    projectNameOrId: flags.project,
  });
  if (link.status === 'error') {
    return { exitCode: link.exitCode };
  }
  if (link.status === 'not_linked') {
    outputActionRequired(client, {
      status: AGENT_STATUS.ACTION_REQUIRED,
      reason: AGENT_REASON.NOT_LINKED,
      message: MISSING_BOTH_MESSAGE,
      hint: 'Link a project or pass --scope and --project.',
      next: [
        {
          command: buildCommandWithGlobalFlags(client.argv, 'link'),
          when: 'link this directory to a project',
        },
      ],
    });
    output.error(MISSING_BOTH_MESSAGE);
    return { exitCode: 1 };
  }

  // A linked directory names its own team, so `--scope` has nothing left to
  // select: it can only disagree. Saying so is the point — the alternative is
  // reading one project and reporting it under another team's name.
  if (
    flags.project === undefined &&
    detectExplicitScope(client) &&
    link.org.id !== client.config.currentTeam
  ) {
    return {
      exitCode: invalidArguments(
        client,
        `The linked project ${link.project.name} belongs to ${link.org.slug || link.org.id}, which is not the scope that was passed. Pass --project <name> to act on a project in that scope.`
      ),
    };
  }

  return {
    teamId: link.org.id,
    projectId: link.project.id,
    projectName: link.project.name,
  };
}
