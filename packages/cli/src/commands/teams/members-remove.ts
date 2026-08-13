import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../util/agent-output';
import { getCommandName } from '../../util/pkg-name';
import getScope from '../../util/get-scope';
import {
  findTeamMember,
  memberIdentifier,
} from '../../util/teams/find-team-member';
import { removeMemberSubcommand } from './command';
import type { TeamsMembersTelemetryClient } from '../../util/telemetry/commands/teams/members';

const usage = getCommandName('teams members remove <member>');

export default async function membersRemove(
  client: Client,
  argv: string[],
  telemetry: TeamsMembersTelemetryClient
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    removeMemberSubcommand.options
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
  const skipConfirmation = Boolean(parsedArgs.flags['--yes']);

  telemetry.trackCliArgumentMember(memberArg);
  telemetry.trackCliFlagYes(parsedArgs.flags['--yes']);

  if (args.length !== 1 || !memberArg) {
    output.error(`Invalid number of arguments. Usage: ${usage}`);
    return 1;
  }

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

  const identity = memberIdentifier(member);

  if (!skipConfirmation) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'confirmation_required',
          message: `Removing a team member requires confirmation. Re-run with \`--yes\` to remove ${identity} from ${teamName}.`,
          next: [
            {
              command: buildCommandWithGlobalFlags(
                client.argv,
                `teams members remove ${memberArg} --yes`
              ),
              when: 'to remove the member without an interactive prompt',
            },
          ],
        },
        1
      );
      output.error(
        `Confirmation required to remove a team member. Re-run with \`--yes\`.`
      );
      return 1;
    }

    output.log(
      `The member ${chalk.bold(identity)} will be removed from ${chalk.bold(
        teamName
      )}.`
    );
    const confirmed = await client.input.confirm(
      `${chalk.bold.red('Are you sure?')}`,
      false
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  await client.fetch(`/v1/teams/${team.id}/members/${member.uid}`, {
    method: 'DELETE',
  });

  output.success(
    `Removed ${chalk.bold(identity)} from ${chalk.bold(teamName)}`
  );
  return 0;
}
