import type Client from '../../util/client';
import cmd from '../../util/output/cmd';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { requestSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';

export default async function request(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(requestSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.args.length > 1) {
    output.error(
      'Invalid number of arguments. Usage: `vercel teams request [userId]`'
    );
    return 2;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const { currentTeam: teamId } = client.config;
  if (!teamId) {
    output.error(
      `This command requires a team scope. Run ${cmd('teams switch')} first.`
    );
    return 1;
  }

  const userId = parsedArgs.args[0];
  const path = userId
    ? `/v1/teams/${encodeURIComponent(teamId)}/request/${encodeURIComponent(userId)}`
    : `/v1/teams/${encodeURIComponent(teamId)}/request`;

  const data = await client.fetch<Record<string, unknown>>(path);

  if (asJson) {
    client.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    return 0;
  }

  output.log(
    `Team: ${String(data.teamName ?? '')} (${String(data.teamSlug ?? '')})`
  );
  output.log(`Confirmed: ${String(data.confirmed ?? '')}`);
  if (data.accessRequestedAt != null) {
    output.log(`Access requested at: ${String(data.accessRequestedAt)}`);
  }
  if (data.joinedFrom && typeof data.joinedFrom === 'object') {
    output.log(`Joined from: ${JSON.stringify(data.joinedFrom)}`);
  }
  return 0;
}
