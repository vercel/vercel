import { help } from '../help';
import { serveCommand } from './command';
import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { ServeTelemetryClient } from '../../util/telemetry/commands/serve';
import { serve } from 'cervel';

export default async function main(client: Client): Promise<number> {
  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(serveCommand.options);

  const telemetry = new ServeTelemetryClient({
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
    telemetry.trackCliFlagHelp('serve');
    output.print(help(serveCommand, { columns: client.stderr.columns }));
    return 2;
  }

  // Get the optional entrypoint argument
  const entrypoint = parsedArgs.args[0] || undefined;

  // Get the current working directory from the client (already absolute)
  const cwd = client.cwd;

  // Call the serve function from cervel
  await serve({
    cwd,
    entrypoint,
    workPath: cwd,
    repoRootPath: cwd,
    config: {
      excludeFiles: [],
    },
    meta: {},
    files: {},
  });

  return 0;
}
