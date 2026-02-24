import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { help } from '../help';
import { add } from '../integration/add';
import { printAddDynamicHelp } from '../integration/add-help';
import { addSubcommand } from '../integration/command';
import { installCommand } from './command';
import output from '../../output-manager';
import { InstallTelemetryClient } from '../../util/telemetry/commands/install';

export default async function install(client: Client) {
  const flagsSpecification = getFlagsSpecification(addSubcommand.options);
  let parsed;
  try {
    parsed = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags } = parsed;
  const telemetry = new InstallTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const ffAutoProvision = process.env.FF_AUTO_PROVISION_INSTALL === '1';
  const cmd = ffAutoProvision
    ? installCommand
    : {
        ...installCommand,
        options: installCommand.options.filter(
          o => o.name !== 'installation-id'
        ),
      };

  if (flags['--help']) {
    telemetry.trackCliFlagHelp('install');

    const printed = await printAddDynamicHelp(
      client,
      args[1],
      cmd,
      c => output.print(help(c, { columns: client.stderr.columns })),
      'install'
    );

    if (!printed) {
      output.print(help(cmd, { columns: client.stderr.columns }));
    }

    return 0;
  }

  if (!ffAutoProvision && flags['--installation-id']) {
    output.error('Unknown or unexpected option: --installation-id');
    return 1;
  }

  return add(client, args.slice(1), flags, 'install');
}
