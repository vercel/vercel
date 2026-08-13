import chalk from 'chalk';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import { AccessGroupTelemetryClient } from '../../util/telemetry/commands/access-group';
import getAccessGroups from '../../util/access-group/get-access-groups';
import { formatAccessGroupsTable } from '../../util/access-group/format';
import { handleAccessGroupError } from '../../util/access-group/error';
import { listSubcommand } from './command';

export default async function ls(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new AccessGroupTelemetryClient({
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

  let accessGroups;
  try {
    accessGroups = await getAccessGroups(client);
  } catch (err) {
    return handleAccessGroupError(err);
  }

  if (asJson) {
    client.stdout.write(`${JSON.stringify({ accessGroups }, null, 2)}\n`);
    return 0;
  }

  const { contextName } = await getScope(client);
  output.log(
    `${
      accessGroups.length > 0 ? 'Access groups' : 'No access groups'
    } found under ${chalk.bold(contextName)} ${lsStamp()}`
  );

  if (accessGroups.length > 0) {
    client.stdout.write(formatAccessGroupsTable(accessGroups));
  }

  return 0;
}
