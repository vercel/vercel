import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import table from '../../util/output/table';
import { validateJsonOutput } from '../../util/output-format';
import { validateLsArgs } from '../../util/validate-ls-args';
import { typesSubcommand } from './command';
import { ActivityTypesTelemetryClient } from '../../util/telemetry/commands/activity/types';
import { isAPIError } from '../../util/errors-ts';

interface UserEventType {
  name: string;
  description?: string;
  deprecated?: boolean;
}

interface UserEventTypesResponse {
  types: UserEventType[];
}

interface TypesFlags {
  '--format'?: string;
}

export default async function types(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new ActivityTypesTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(typesSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs as {
    args: string[];
    flags: TypesFlags;
  };

  const argValidationResult = validateLsArgs({
    commandName: 'activity types',
    args,
    maxArgs: 0,
    exitCode: 2,
  });
  if (argValidationResult !== 0) {
    return argValidationResult;
  }

  telemetry.trackCliOptionFormat(flags['--format']);

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }

  const jsonOutput = formatResult.jsonOutput;

  try {
    const response =
      await client.fetch<UserEventTypesResponse>('/v1/events/types');

    if (jsonOutput) {
      client.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
      return 0;
    }

    if (!response.types || response.types.length === 0) {
      output.log('No activity event types found.');
      return 0;
    }

    const rows = [
      [
        chalk.bold(chalk.cyan('Name')),
        chalk.bold(chalk.cyan('Description')),
        chalk.bold(chalk.cyan('Deprecated')),
      ],
      ...response.types.map(eventType => [
        eventType.name,
        eventType.description ?? '-',
        eventType.deprecated ? 'Yes' : 'No',
      ]),
    ];

    const tableOutput = table(rows, { hsep: 4 }).replace(/^/gm, '  ');
    output.print(`\n${tableOutput}\n\n`);

    return 0;
  } catch (err) {
    if (isAPIError(err)) {
      if (err.status === 403) {
        output.error(
          'You do not have permission to list activity event types.'
        );
        return 1;
      }

      output.error(err.serverMessage || `API error (${err.status}).`);
      return 1;
    }

    throw err;
  }
}
