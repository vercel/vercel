import { gray } from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { outputAgentError } from '../../util/agent-output';
import { membersSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';

interface TeamMember {
  uid: string;
  email?: string;
  username?: string;
  role?: string;
}

interface TeamMembersResponse {
  members: TeamMember[];
}

export default async function members(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(membersSubcommand.options);
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

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const teamId = client.config.currentTeam;
  if (!teamId) {
    output.error(
      'Team scope is required. Run `vercel teams switch <slug>` or pass `--scope`.'
    );
    return 1;
  }

  const result = await client.fetch<TeamMembersResponse>(
    `/v2/teams/${teamId}/members`
  );
  const membersList = result.members || [];

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify({ members: membersList }, null, 2)}\n`
    );
    return 0;
  }

  const rows = [
    ['uid', 'Identity', 'Role'].map(str => gray(str)),
    ...membersList.map(member => [
      member.uid,
      member.username || member.email || '',
      member.role || '',
    ]),
  ];
  client.stderr.write(`${table(rows, { hsep: 3 })}\n`);
  return 0;
}
