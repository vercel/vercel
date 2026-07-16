import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { help, type Command } from '../help';
import { getCommandAliases } from '..';
import { TracesTelemetryClient } from '../../util/telemetry/commands/traces';
import {
  createSubcommand as createSubcommandMetadata,
  getSubcommand as getSubcommandMetadata,
  tracesCommand,
} from './command';
import get from './get';
import { runCurl } from '../curl';
import { getArgsAfterCommand } from '../curl/shared';

const COMMAND_CONFIG = {
  get: getCommandAliases(getSubcommandMetadata),
  create: getCommandAliases(createSubcommandMetadata),
};

const SUBCOMMAND_METADATA: Record<string, Command> = {
  [getSubcommandMetadata.name]: getSubcommandMetadata,
  [createSubcommandMetadata.name]: createSubcommandMetadata,
};

export default async function traces(client: Client): Promise<number> {
  const telemetry = new TracesTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(tracesCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const { subcommand, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('traces', subcommandOriginal);
    const subMetadata =
      typeof subcommand === 'string'
        ? SUBCOMMAND_METADATA[subcommand]
        : undefined;
    output.print(
      help(subMetadata ?? tracesCommand, {
        parent: subMetadata ? tracesCommand : undefined,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  if (subcommand === createSubcommandMetadata.name) {
    // `traces create` is an alias for `vercel curl --trace`. The router
    // Drop the command prefix while accounting for global flags in any of the
    // positions accepted by the root CLI parser. Passing `args` explicitly
    // avoids mutating `client.argv` (the live `process.argv` in production).
    const tracesArgs = getArgsAfterCommand(
      client.argv.slice(2),
      tracesCommand.name
    );
    const args = getArgsAfterCommand(tracesArgs, createSubcommandMetadata.name);
    return runCurl(client, { forceTrace: true, args });
  }

  return get(client, telemetry);
}
