import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { help } from '../help';
import { add } from './add';
import { integrationCommand } from './command';
import { list } from './list';
import { openIntegration } from './open-integration';
import output from '../../output-manager';
import { IntegrationTelemetryClient } from '../../util/telemetry/commands/integration';

const COMMAND_CONFIG = {
  add: ['add'],
  open: ['open'],
  list: ['list', 'ls'],
};

export default async function main(client: Client) {
  const telemetry = new IntegrationTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });
  const { args, flags } = parseArguments(
    client.argv.slice(2),
    getFlagsSpecification(integrationCommand.options),
    { permissive: true }
  );
  const {
    subcommand,
    subcommandOriginal,
    args: subArgs,
  } = getSubcommand(args.slice(1), COMMAND_CONFIG);

  if (flags['--help']) {
    output.print(help(integrationCommand, { columns: client.stderr.columns }));
    return 2;
  }

  switch (subcommand) {
    case 'add': {
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return add(client, subArgs);
    }
    case 'list': {
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list(client);
    }
    case 'open': {
      telemetry.trackCliSubcommandOpen(subcommandOriginal);
      return openIntegration(client, subArgs);
    }
    default: {
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      return 2;
    }
  }
}
