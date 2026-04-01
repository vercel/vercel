import { gray } from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { outputAgentError } from '../../util/agent-output';
import { membersSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import { packageName } from '../../util/pkg-name';
import getCommandFlags from '../../util/get-command-flags';
import cmd from '../../util/output/cmd';
import output from '../../output-manager';

interface TeamMember {
  uid: string;
  email?: string;
  username?: string;
  role?: string;
}

interface TeamMembersResponse {
  members: TeamMember[];
  pagination: {
    count: number;
    next: number;
    prev: number;
  };
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

  const next = parsedArgs.flags['--next'];
  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  if (typeof next !== 'undefined' && !Number.isInteger(next)) {
    output.error('Please provide a number for flag `--next`');
    return 1;
  }

  const teamId = client.config.currentTeam;
  if (!teamId) {
    output.error(
      'Team scope is required. Run `vercel teams switch <slug>` or pass `--scope`.'
    );
    return 1;
  }

  const query = new URLSearchParams({ limit: '20' });
  if (next) {
    query.set('next', String(next));
  }

  const result = await client.fetch<TeamMembersResponse>(
    `/v2/teams/${teamId}/members?${query}`
  );
  const members = result.members || [];
  const { pagination } = result;

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify({ members, pagination }, null, 2)}\n`
    );
    return 0;
  }

  const rows = [
    ['uid', 'Identity', 'Role'].map(str => gray(str)),
    ...members.map(member => [
      member.uid,
      member.username || member.email || '',
      member.role || '',
    ]),
  ];
  client.stderr.write(`${table(rows, { hsep: 3 })}\n`);

  if (pagination?.count === 20) {
    const flags = getCommandFlags(parsedArgs.flags, ['--next', '-N']);
    const nextCmd = `${packageName} teams members${flags} --next ${pagination.next}`;
    output.log(`To display the next page run ${cmd(nextCmd)}`);
  }

  return 0;
}
