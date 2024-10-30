import Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { help } from '../help';
import { add } from '../integration/add';
import { installCommand } from './command';
import output from '../../output-manager';
import { InspectTelemetryClient } from '../../util/telemetry/commands/inspect';

export default async function install(client: Client) {
  const { args, flags } = parseArguments(client.argv.slice(2));
  const telemetry = new InspectTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  if (flags['--help']) {
    telemetry.trackCliFlagHelp('install');
    output.print(help(installCommand, { columns: client.stderr.columns }));
    return 2;
  }

  await add(client, args.slice(1));
}
