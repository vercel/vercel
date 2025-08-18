import { help } from '../help';
import { whoamiCommand } from './command';

import getScope from '../../util/get-scope';
import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { WhoamiTelemetryClient } from '../../util/telemetry/commands/whoami';

export default async function whoami(client: Client): Promise<number> {
  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(whoamiCommand.options);

  const telemetry = new WhoamiTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  // Parse CLI args
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('whoami');
    output.print(help(whoamiCommand, { columns: client.stderr.columns }));
    return 0;
  }

  const { contextName } = await getScope(client, { getTeam: false });

  if (client.stdout.isTTY) {
    output.log(contextName);
  } else {
    // If stdout is not a TTY, then only print the username
    // to support piping the output to another file / exe
    client.stdout.write(`${contextName}\n`);
  }

  return 0;
}
