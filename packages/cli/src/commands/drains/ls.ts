import chalk from 'chalk';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import { DrainsTelemetryClient } from '../../util/telemetry/commands/drains';
import getDrains from '../../util/drains/get-drains';
import {
  formatDrainsTable,
  redactDrainForJson,
} from '../../util/drains/format';
import { handleDrainsError } from '../../util/drains/error';
import { listSubcommand } from './command';

export default async function ls(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new DrainsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(listSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const { flags } = parsedArgs;

  telemetry.trackCliOptionFormat(flags['--format']);

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const lsStamp = stamp();

  let drains;
  try {
    drains = await getDrains(client);
  } catch (err) {
    return handleDrainsError(err);
  }

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify({ drains: drains.map(redactDrainForJson) }, null, 2)}\n`
    );
    return 0;
  }

  const { contextName } = await getScope(client);
  output.log(
    `${
      drains.length > 0 ? 'Drains' : 'No drains'
    } found under ${chalk.bold(contextName)} ${lsStamp()}`
  );

  if (drains.length > 0) {
    client.stdout.write(formatDrainsTable(drains));
  }

  return 0;
}
