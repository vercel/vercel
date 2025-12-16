import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { help } from '../help';
import { tunnelCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { TunnelTelemetryClient } from '../../util/telemetry/commands/tunnel';

export default async function main(client: Client) {
  const { telemetryEventStore } = client;
  const telemetry = new TunnelTelemetryClient({
    opts: {
      store: telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(tunnelCommand.options);
  let parsedArgs = null;

  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const port = parsedArgs.flags['--port'];
  const prod = parsedArgs.flags['--prod'];

  telemetry.trackCliOptionPort(port);
  telemetry.trackCliFlagProd(prod);

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('tunnel');
    output.print(help(tunnelCommand, { columns: client.stderr.columns }));
    return 2;
  }

  if (parsedArgs.args.length > 1) {
    output.error(`${getCommandName('tunnel')} does not accept any arguments`);
    return 1;
  }

  if (!port) {
    output.error('The `--port` option is required');
    return 1;
  }

  if (typeof port !== 'number' || port < 1 || port > 65535) {
    output.error(
      'The `--port` option must be a valid port number between 1 and 65535'
    );
    return 1;
  }

  try {
    output.print(`Starting tunnel with port ${port} on prod: ${prod}\n`);
  } catch (err) {
    output.prettyError(err);
    return 1;
  }
}
