import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { help } from '../help';
import { add } from '../integration/add';
import { printAddDynamicHelp } from '../integration/add-help';
import { addSubcommand } from '../integration/command';
import { installCommand } from './command';
import { InstallTelemetryClient } from '../../util/telemetry/commands/install';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';

export default async function install(client: Client) {
  const flagsSpecification = getFlagsSpecification(addSubcommand.options);
  let parsed;
  try {
    parsed = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }
  const { args, flags } = parsed;
  if (args[0] === 'i') {
    warnDeprecatedSubcommand(client, 'i', 'install');
  }
  const telemetry = new InstallTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  if (flags['--help']) {
    telemetry.trackCliFlagHelp('install');

    const printed = await printAddDynamicHelp(
      client,
      args[1],
      installCommand,
      (c, options) =>
        client.stdout.write(
          help(c, {
            ...options,
            stream: client.stdout,
            columns: client.stdout.columns ?? client.stderr.columns,
          })
        ),
      'install'
    );

    if (!printed) {
      client.stdout.write(
        help(installCommand, {
          stream: client.stdout,
          columns: client.stdout.columns ?? client.stderr.columns,
        })
      );
    }

    return 0;
  }

  return add(client, args.slice(1), flags, 'install');
}
