import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import table from '../../util/output/table';
import { validateJsonOutput } from '../../util/output-format';
import { typesSubcommand } from './command';
import type { ActivityTelemetryClient } from '../../util/telemetry/commands/activity';
import { isAPIError } from '../../util/errors-ts';

interface UserEventType {
  name: string;
  description?: string;
  deprecated?: boolean;
}

interface UserEventTypesResponse {
  types: UserEventType[];
}

function formatErrorJson(code: string, message: string): string {
  return `${JSON.stringify({ error: { code, message } }, null, 2)}\n`;
}

export default async function types(
  client: Client,
  telemetry: ActivityTelemetryClient
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(typesSubcommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const flags = parsedArgs.flags as { '--format'?: string };

  telemetry.trackCliOptionFormat(flags['--format']);

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }

  const jsonOutput = formatResult.jsonOutput;

  output.spinner('Fetching event types...');
  try {
    const response =
      await client.fetch<UserEventTypesResponse>('/v1/events/types');
    const eventTypes = response.types ?? [];

    if (jsonOutput) {
      client.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
      return 0;
    }

    if (eventTypes.length === 0) {
      output.log('No activity event types found.');
      return 0;
    }

    const rows = [
      [chalk.bold(chalk.cyan('Name')), chalk.bold(chalk.cyan('Description'))],
      ...eventTypes.map(eventType => [
        eventType.name,
        eventType.deprecated
          ? `${eventType.description ?? '-'} (Deprecated)`
          : (eventType.description ?? '-'),
      ]),
    ];

    const tableOutput = table(rows, { hsep: 4 })
      .split('\n')
      .map(line => line.trimEnd())
      .join('\n')
      .replace(/^/gm, '  ');
    output.print(`\n${tableOutput}\n\n`);

    return 0;
  } catch (err) {
    if (isAPIError(err)) {
      if (err.status === 403) {
        const message =
          'You do not have permission to list activity event types.';
        if (jsonOutput) {
          client.stdout.write(formatErrorJson('FORBIDDEN', message));
        } else {
          output.error(message);
        }
        return 1;
      }

      const message = err.serverMessage || `API error (${err.status}).`;
      if (jsonOutput) {
        client.stdout.write(formatErrorJson(err.code || 'API_ERROR', message));
      } else {
        output.error(message);
      }
      return 1;
    }

    throw err;
  } finally {
    output.stopSpinner();
  }
}
