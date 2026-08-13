import chalk from 'chalk';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import output from '../../output-manager';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import { AccessGroupTelemetryClient } from '../../util/telemetry/commands/access-group';
import getAccessGroup from '../../util/access-group/get-access-group';
import { formatAccessGroupDetails } from '../../util/access-group/format';
import { handleAccessGroupError } from '../../util/access-group/error';
import { inspectSubcommand } from './command';

export default async function inspect(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new AccessGroupTelemetryClient({
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

  const idOrName = parsedArgs.args[0];
  if (!idOrName) {
    output.error(
      `Please provide an access group id or name. See ${getCommandName(
        'access-group inspect <idOrName>'
      )}`
    );
    return 1;
  }

  telemetry.trackCliArgumentIdOrName(idOrName);

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  let accessGroup;
  try {
    accessGroup = await getAccessGroup(client, idOrName);
  } catch (err) {
    return handleAccessGroupError(err);
  }

  if (asJson) {
    client.stdout.write(`${JSON.stringify(accessGroup, null, 2)}\n`);
    return 0;
  }

  const { contextName } = await getScope(client);
  output.log(
    `Access group ${chalk.bold(accessGroup.name)} (${
      accessGroup.accessGroupId
    }) under ${chalk.bold(contextName)}`
  );
  client.stdout.write(formatAccessGroupDetails(accessGroup));

  return 0;
}
