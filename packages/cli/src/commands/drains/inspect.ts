import chalk from 'chalk';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import output from '../../output-manager';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import { DrainsTelemetryClient } from '../../util/telemetry/commands/drains';
import getDrainById from '../../util/drains/get-drain-by-id';
import {
  formatDrainDetails,
  redactDrainForJson,
} from '../../util/drains/format';
import { handleDrainsError } from '../../util/drains/error';
import { inspectSubcommand } from './command';

export default async function inspect(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new DrainsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(inspectSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const { flags } = parsedArgs;

  telemetry.trackCliOptionFormat(flags['--format']);

  const id = parsedArgs.args[0];
  if (!id) {
    output.error(
      `Please provide a drain id. See ${getCommandName('drains inspect <id>')}`
    );
    return 1;
  }

  telemetry.trackCliArgumentId(id);

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  let drain;
  try {
    drain = await getDrainById(client, id);
  } catch (err) {
    return handleDrainsError(err);
  }

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(redactDrainForJson(drain), null, 2)}\n`
    );
    return 0;
  }

  const { contextName } = await getScope(client);
  output.log(
    `Drain ${chalk.bold(drain.name)} (${drain.id}) under ${chalk.bold(contextName)}`
  );
  client.stdout.write(formatDrainDetails(drain));

  return 0;
}
