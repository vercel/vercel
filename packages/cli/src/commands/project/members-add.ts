import type { JSONObject } from '@vercel-internals/types';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  buildCommandWithGlobalFlags,
  exitWithNonInteractiveError,
  outputActionRequired,
  outputAgentError,
  shouldEmitNonInteractiveCommandError,
} from '../../util/agent-output';
import { canPrompt } from '../../util/can-prompt';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
} from '../../util/agent-output-constants';
import { isAPIError } from '../../util/errors-ts';
import { membersAddFlags, PROJECT_MEMBER_ROLES } from './command';
import { validateJsonOutput } from '../../util/output-format';
import { getGlobalFlagsFromArgs } from '../../util/arg-common';
import { email as emailRegex } from '../../util/input/regexes';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import { ProjectTelemetryClient } from '../../util/telemetry/commands/project';
import getScope from '../../util/get-scope';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';

function memberToBodyField(member: string): JSONObject {
  if (emailRegex.test(member)) {
    return { email: member };
  }
  if (/^[A-Za-z0-9]{24,}$/.test(member)) {
    return { uid: member };
  }
  return { username: member };
}

const PROJECT_ROLES_BY_TEAM_ROLE: Record<string, readonly string[]> = {
  CONTRIBUTOR: [
    'PROJECT_VIEWER',
    'PROJECT_DEVELOPER',
    'ADMIN',
    'PROJECT_GUEST',
  ],
  DEVELOPER: ['ADMIN'],
  SECURITY: ['ADMIN', 'PROJECT_DEVELOPER'],
};

export async function membersAdd(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new ProjectTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification([...membersAddFlags]);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    outputAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: error instanceof Error ? error.message : String(error),
    });
    printError(error);
    return 1;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    outputAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: formatResult.error,
    });
    output.error(formatResult.error);
    return 1;
  }
  const { jsonOutput } = formatResult;
  const asJson = jsonOutput;

  function fail(
    reason: string,
    message: string,
    humanMessage: string = message,
    extra?: Record<string, unknown>
  ): number {
    if (shouldEmitNonInteractiveCommandError(client)) {
      outputAgentError(client, {
        status: AGENT_STATUS.ERROR,
        reason,
        message,
        ...extra,
      });
      return 1;
    }
    if (jsonOutput || !canPrompt(client)) {
      client.stdout.write(
        `${JSON.stringify(
          { status: AGENT_STATUS.ERROR, reason, message },
          null,
          2
        )}\n`
      );
      return 1;
    }
    output.error(humanMessage);
    return 1;
  }

  if (parsedArgs.args.length !== 2) {
    return fail(
      AGENT_REASON.INVALID_ARGUMENTS,
      'Invalid number of arguments. Usage: `vercel project members add <project> <member> --role <role>`',
      'Invalid number of arguments. Usage: `vercel project members add <project> <member> --role <role>`',
      {
        hint: `Valid roles: ${PROJECT_MEMBER_ROLES.join(', ')}`,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'project members add <project> <member> --role PROJECT_VIEWER'
            ),
            when: 'Add a member to a project (replace <project> and <member>)',
          },
        ],
      }
    );
  }

  const [projectNameOrId, member] = parsedArgs.args;
  telemetry.trackCliArgumentProject(projectNameOrId);
  telemetry.trackCliArgumentMember(member);

  const roleRaw = parsedArgs.flags['--role'];
  telemetry.trackCliOptionRole(
    typeof roleRaw === 'string' ? roleRaw.trim().toUpperCase() : undefined
  );
  if (typeof roleRaw !== 'string' || !roleRaw.trim()) {
    return fail(
      AGENT_REASON.MISSING_ARGUMENTS,
      `\`--role\` is required. Valid roles: ${PROJECT_MEMBER_ROLES.join(', ')}`
    );
  }
  const role = roleRaw.trim().toUpperCase();
  if (!(PROJECT_MEMBER_ROLES as readonly string[]).includes(role)) {
    return fail(
      AGENT_REASON.INVALID_ARGUMENTS,
      `\`--role\` must be one of: ${PROJECT_MEMBER_ROLES.join(', ')}`
    );
  }

  let teamPlan: string | undefined;
  try {
    const { team } = await getScope(client);
    teamPlan = team?.billing?.plan;
  } catch {
    teamPlan = undefined;
  }
  if (teamPlan === 'hobby' || teamPlan === 'oss') {
    const message = `Adding project members requires a Pro or Enterprise team (this team is on the ${teamPlan} plan).`;
    if (shouldEmitNonInteractiveCommandError(client)) {
      outputAgentError(client, {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.PLAN_UPGRADE_REQUIRED,
        message,
        hint: `Upgrade the team with \`${getCommandNamePlain('buy pro')}\`.`,
      });
      return 1;
    }
    if (jsonOutput || !canPrompt(client)) {
      client.stdout.write(
        `${JSON.stringify(
          {
            status: AGENT_STATUS.ERROR,
            reason: AGENT_REASON.PLAN_UPGRADE_REQUIRED,
            message,
          },
          null,
          2
        )}\n`
      );
      return 1;
    }
    output.error(message);
    output.log(`Upgrade the team with ${getCommandName('buy pro')}.`);
    return 1;
  }

  if (!canPrompt(client)) {
    const globalFlags = getGlobalFlagsFromArgs(client.argv.slice(2)).filter(
      flag => flag !== '--non-interactive'
    );
    const interactiveCommand = getCommandNamePlain(
      `project members add ${projectNameOrId} ${member} --role ${role} ${globalFlags.join(
        ' '
      )}`.trim()
    );
    outputActionRequired(
      client,
      {
        status: AGENT_STATUS.ACTION_REQUIRED,
        reason: AGENT_REASON.CONFIRMATION_REQUIRED,
        action: AGENT_ACTION.CONFIRMATION_REQUIRED,
        message:
          `Adding ${member} grants them the ${role} role on ${projectNameOrId}. ` +
          'This cannot be confirmed non-interactively: the user must run this command in a terminal and confirm.',
        userActionRequired: true,
        hint: 'Surface this to the user; the confirmation cannot be automated.',
        next: [
          {
            command: interactiveCommand,
            when: 'user runs this command in an interactive terminal',
          },
        ],
      },
      1
    );
    output.error(
      'This command must be run interactively because it grants a project role.'
    );
    return 1;
  }

  const body: JSONObject = { ...memberToBodyField(member), role };

  try {
    const project = await getProjectByCwdOrLink({
      client,
      commandName: 'project members add',
      projectNameOrId,
      forReadOnlyCommand: true,
    });

    const confirmed = await client.input.confirm(
      `Grant ${member} the ${role} role on ${project.name}?`,
      false
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }

    const result = await client.fetch<JSONObject>(
      `/v1/projects/${encodeURIComponent(project.id)}/members`,
      {
        method: 'POST',
        body,
      }
    );

    if (asJson) {
      client.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    output.log(`Added ${member} to ${project.name} as ${role}.`);
    return 0;
  } catch (err: unknown) {
    if (
      isAPIError(err) &&
      err.status === 400 &&
      /not a confirmed member of the team/i.test(err.serverMessage)
    ) {
      const humanIntro = `${member} must be a confirmed member of the team before you can assign a project role.`;
      const message = `${humanIntro} Invite them to the team first with \`${getCommandNamePlain('teams invite')}\`.`;
      if (shouldEmitNonInteractiveCommandError(client)) {
        outputAgentError(client, {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.NOT_TEAM_MEMBER,
          message,
        });
        return 1;
      }
      if (jsonOutput || !canPrompt(client)) {
        client.stdout.write(
          `${JSON.stringify(
            {
              status: AGENT_STATUS.ERROR,
              reason: AGENT_REASON.NOT_TEAM_MEMBER,
              message,
            },
            null,
            2
          )}\n`
        );
        return 1;
      }
      output.error(humanIntro);
      output.log(
        `Invite them to the team first with ${getCommandName('teams invite')}.`
      );
      return 1;
    }
    if (
      isAPIError(err) &&
      err.status === 400 &&
      /invalid role combination/i.test(err.serverMessage)
    ) {
      const humanIntro = `${member} can't be assigned the ${role} role because their team role does not permit it.`;
      const pairs = Object.entries(PROJECT_ROLES_BY_TEAM_ROLE);
      const footer =
        'Team Members and Owners already have access to every project, so they cannot be given a project role.';
      const message = `${humanIntro} Project roles map to team roles as: ${pairs
        .map(([teamRole, roles]) => `${teamRole} → ${roles.join('/')}`)
        .join('; ')}. ${footer}`;
      if (shouldEmitNonInteractiveCommandError(client)) {
        outputAgentError(client, {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_ROLE_COMBINATION,
          message,
        });
        return 1;
      }
      if (jsonOutput || !canPrompt(client)) {
        client.stdout.write(
          `${JSON.stringify(
            {
              status: AGENT_STATUS.ERROR,
              reason: AGENT_REASON.INVALID_ROLE_COMBINATION,
              message,
            },
            null,
            2
          )}\n`
        );
        return 1;
      }
      output.error(humanIntro);
      output.log('Project roles can only be assigned to these team roles:');
      for (const [teamRole, roles] of pairs) {
        output.log(`  ${teamRole} → ${roles.join(', ')}`);
      }
      output.log(footer);
      return 1;
    }
    exitWithNonInteractiveError(client, err, 1, { variant: 'members' });
    if (jsonOutput || !canPrompt(client)) {
      client.stdout.write(
        `${JSON.stringify(
          {
            status: AGENT_STATUS.ERROR,
            reason: AGENT_REASON.API_ERROR,
            message: err instanceof Error ? err.message : String(err),
          },
          null,
          2
        )}\n`
      );
      return 1;
    }
    printError(err);
    return 1;
  }
}
