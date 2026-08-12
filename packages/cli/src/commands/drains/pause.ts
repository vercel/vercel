import chalk from 'chalk';
import type Client from '../../util/client';
import updateDrain from '../../util/drains/update-drain';
import { handleDrainsError } from '../../util/drains/error';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import { validateJsonOutput } from '../../util/output-format';
import { DrainsTelemetryClient } from '../../util/telemetry/commands/drains';
import { pauseSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';

export default async function pause(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new DrainsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(pauseSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const { flags } = parsedArgs;

  const id = parsedArgs.args[0];
  if (!id) {
    output.error(
      `Please provide a drain id. See ${getCommandName('drains pause <id>')}`
    );
    return 1;
  }

  telemetry.trackCliArgumentId(id);
  telemetry.trackCliOptionFormat(flags['--format']);

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const s = stamp();
  let updated;
  try {
    updated = await updateDrain(client, id, { status: 'disabled' });
  } catch (err) {
    return handleDrainsError(err);
  }

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify({ id, status: updated.status }, null, 2)}\n`
    );
    return 0;
  }

  output.success(`Drain ${chalk.gray(id)} paused ${chalk.gray(s())}`);
  return 0;
}
