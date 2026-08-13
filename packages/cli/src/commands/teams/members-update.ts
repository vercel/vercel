import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { outputAgentError } from '../../util/agent-output';
import { getCommandName } from '../../util/pkg-name';
import getScope from '../../util/get-scope';
import {
  findTeamMember,
  memberIdentifier,
} from '../../util/teams/find-team-member';
import { updateMemberSubcommand, teamRoles, type TeamRole } from './command';
import type { TeamsMembersTelemetryClient } from '../../util/telemetry/commands/teams/members';

const usage = getCommandName('teams members update <member> --role <role>');

export default async function membersUpdate(
  client: Client,
  argv: string[],
  telemetry: TeamsMembersTelemetryClient
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    updateMemberSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_arguments',
          message: error instanceof Error ? error.message : String(error),
        },
        1
      );
    }
    printError(error);
    return 1;
  }

  const { args } = parsedArgs;
  const memberArg = args[0];
  const roleFlag = parsedArgs.flags['--role'];

  telemetry.trackCliArgumentMember(memberArg);

  if (args.length !== 1 || !memberArg) {
    output.error(`Invalid number of arguments. Usage: ${usage}`);
    return 1;
  }

  if (typeof roleFlag !== 'string' || roleFlag.trim().length === 0) {
    output.error(`The \`--role\` flag is required. Usage: ${usage}`);
    return 1;
  }

  const normalizedRole = roleFlag.trim().toUpperCase();
  if (!teamRoles.includes(normalizedRole as TeamRole)) {
    output.error(
      `Invalid role "${roleFlag}". Valid roles: ${teamRoles.join(', ')}.`
    );
    return 1;
  }
  const role = normalizedRole as TeamRole;
  telemetry.trackCliOptionRole(role);

  const { team, contextName } = await getScope(client);
  if (!team) {
    output.error(
      'Team scope is required. Run `vercel teams switch <slug>` or pass `--scope`.'
    );
    return 1;
  }
  const teamName = team.name || team.slug || contextName;

  output.spinner('Resolving member');
  let member;
  try {
    member = await findTeamMember(client, team.id, memberArg);
  } finally {
    output.stopSpinner();
  }

  if (!member) {
    output.error(
      `No member matching "${memberArg}" found in ${chalk.bold(teamName)}.`
    );
    output.log(`Run ${getCommandName('teams members')} to list team members.`);
    return 1;
  }

  await client.fetch(`/v1/teams/${team.id}/members/${member.uid}`, {
    method: 'PATCH',
    body: { role },
  });

  output.success(
    `Updated ${chalk.bold(memberIdentifier(member))} to role ${chalk.bold(
      role
    )} on ${chalk.bold(teamName)}`
  );
  return 0;
}
