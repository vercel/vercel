import { gray } from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  exitWithNonInteractiveError,
  outputAgentError,
} from '../../util/agent-output';
import { accessSummarySubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';

export default async function accessSummary(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    accessSummarySubcommand.options
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

  if (parsedArgs.args.length > 1) {
    output.error(
      'Invalid number of arguments. Usage: `vercel project access-summary [name]`'
    );
    return 2;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  let summary: Record<string, number>;
  try {
    const project = await getProjectByCwdOrLink({
      client,
      commandName: 'project access-summary',
      projectNameOrId: parsedArgs.args[0],
      forReadOnlyCommand: true,
    });

    summary = await client.fetch<Record<string, number>>(
      `/v1/projects/${encodeURIComponent(project.id)}/members/summary`
    );
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, {
      variant: 'access-summary',
    });
    printError(err);
    return 1;
  }

  if (asJson) {
    client.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return 0;
  }

  const entries = Object.entries(summary).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  if (entries.length === 0) {
    output.log('No summary data returned.');
    return 0;
  }

  const rows = [
    ['Role', 'Count'].map(h => gray(h)),
    ...entries.map(([role, count]) => [role, String(count)]),
  ];
  client.stderr.write(`${table(rows, { hsep: 3 })}\n`);
  return 0;
}
