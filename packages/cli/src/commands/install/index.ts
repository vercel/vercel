import output from '../../output-manager';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { InstallTelemetryClient } from '../../util/telemetry/commands/install';
import { help } from '../help';
import { add } from '../integration/add';
import { installCommand } from './command';

export default async function install(client: Client) {
  const { args, flags } = parseArguments(client.argv.slice(2));
  const telemetry = new InstallTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  if (flags['--help']) {
    telemetry.trackCliFlagHelp('install');
    output.print(help(installCommand, { columns: client.stderr.columns }));
    return 0;
  }

  await add(client, args.slice(1));
}
