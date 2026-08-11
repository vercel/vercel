import chalk from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import type { Drain } from '../../util/drains/types';
import getDrainById from '../../util/drains/get-drain-by-id';
import deleteDrain from '../../util/drains/delete-drain';
import { formatDataType, formatDestination } from '../../util/drains/format';
import { handleDrainsError } from '../../util/drains/error';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import { DrainsTelemetryClient } from '../../util/telemetry/commands/drains';
import { removeSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  buildCommandWithYes,
  outputActionRequired,
} from '../../util/agent-output';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
} from '../../util/agent-output-constants';

export default async function rm(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new DrainsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(removeSubcommand.options);
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
      `Please provide a drain id. See ${getCommandName('drains rm <id>')}`
    );
    return 1;
  }

  telemetry.trackCliArgumentId(id);
  telemetry.trackCliFlagYes(flags['--yes']);

  let drain;
  try {
    drain = await getDrainById(client, id);
  } catch (err) {
    return handleDrainsError(err);
  }

  const skipConfirmation = flags['--yes'];

  if (client.nonInteractive && !skipConfirmation) {
    outputActionRequired(
      client,
      {
        status: AGENT_STATUS.ACTION_REQUIRED,
        reason: AGENT_REASON.CONFIRMATION_REQUIRED,
        action: AGENT_ACTION.CONFIRMATION_REQUIRED,
        message: 'In non-interactive mode --yes is required to remove a drain.',
        next: [
          {
            command: buildCommandWithYes(client.argv),
            when: 'to confirm removal',
          },
        ],
      },
      1
    );
    return 1;
  }

  const yes = skipConfirmation || (await readConfirmation(client, drain));
  if (!yes) {
    output.error('User canceled.');
    return 0;
  }

  const rmStamp = stamp();
  try {
    await deleteDrain(client, id);
  } catch (err) {
    return handleDrainsError(err);
  }

  if (flags['--json']) {
    client.stdout.write(`${JSON.stringify({ removed: true, id }, null, 2)}\n`);
    return 0;
  }

  output.success(`Drain ${chalk.gray(id)} removed ${chalk.gray(rmStamp())}`);
  return 0;
}

function readConfirmation(client: Client, drain: Drain): Promise<boolean> {
  return new Promise(resolve => {
    output.log('The following drain will be removed permanently');
    output.print(
      `${table(
        [
          [
            drain.id,
            drain.name,
            formatDataType(drain),
            formatDestination(drain),
          ],
        ],
        { align: ['l', 'l', 'l', 'l'], hsep: 3 }
      ).replace(/^(.*)/gm, '  $1')}\n`
    );
    output.print(
      `${chalk.bold.red('> Are you sure?')} ${chalk.gray('(y/N) ')}`
    );
    client.stdin
      .on('data', d => {
        process.stdin.pause();
        resolve(d.toString().trim().toLowerCase() === 'y');
      })
      .resume();
  });
}
