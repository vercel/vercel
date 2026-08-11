import chalk from 'chalk';
import type Client from '../../util/client';
import setDrainStatus from '../../util/drains/set-drain-status';
import { handleDrainsError } from '../../util/drains/error';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import { DrainsTelemetryClient } from '../../util/telemetry/commands/drains';
import { resumeSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';

export default async function resume(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new DrainsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(resumeSubcommand.options);
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
      `Please provide a drain id. See ${getCommandName('drains resume <id>')}`
    );
    return 1;
  }

  telemetry.trackCliArgumentId(id);

  const s = stamp();
  let updated;
  try {
    updated = await setDrainStatus(client, id, 'enabled');
  } catch (err) {
    return handleDrainsError(err);
  }

  if (flags['--json']) {
    client.stdout.write(
      `${JSON.stringify({ id, status: updated.status }, null, 2)}\n`
    );
    return 0;
  }

  output.success(`Drain ${chalk.gray(id)} resumed ${chalk.gray(s())}`);
  return 0;
}
