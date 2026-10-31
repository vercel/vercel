import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { help, type Command } from '../help';
import { getCommandAliases } from '..';
import { TracesTelemetryClient } from '../../util/telemetry/commands/traces';
import {
  createSubcommand as createSubcommandMetadata,
  getSubcommand as getSubcommandMetadata,
  searchSubcommand as searchSubcommandMetadata,
  tracesCommand,
} from './command';
import { tracesConfigCommand } from './config/command';
import get from './get';
import { runCurl } from '../curl';
import search from './search';
import { invalidArguments } from './config/errors';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';

const COMMAND_CONFIG = {
  inspect: getCommandAliases(getSubcommandMetadata),
  create: getCommandAliases(createSubcommandMetadata),
  search: getCommandAliases(searchSubcommandMetadata),
  config: getCommandAliases(tracesConfigCommand),
};

const SUBCOMMAND_METADATA: Record<string, Command> = {
  [getSubcommandMetadata.name]: getSubcommandMetadata,
  [createSubcommandMetadata.name]: createSubcommandMetadata,
  [searchSubcommandMetadata.name]: searchSubcommandMetadata,
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
    return invalidArguments(
      client,
      err instanceof Error ? err.message : String(err)
    );
  }

  const { subcommand, subcommandOriginal, args } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );
  const needHelp = Boolean(parsedArgs.flags['--help']);

  if (subcommand === tracesConfigCommand.name) {
    // The `config` group owns its own help and subcommand routing, including
    // the bare `traces config` case.
    return (await import('./config')).default(client, {
      args,
      needHelp,
      subcommandOriginal,
      telemetry,
    });
  }

  if (needHelp) {
    telemetry.trackCliFlagHelp('traces', subcommandOriginal);
    const subMetadata =
      typeof subcommand === 'string'
        ? SUBCOMMAND_METADATA[subcommand]
        : undefined;
    output.print(
      help(subMetadata ?? tracesCommand, {
        stream: client.stderr,
        parent: subMetadata ? tracesCommand : undefined,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  if (subcommand === createSubcommandMetadata.name) {
    // `traces create` is an alias for `vercel curl --trace`. The router
    // dispatched here off `client.argv`, so the first two tokens are always
    // `traces create` (like `curl`, this assumes no global flags precede the
    // command token). Drop that prefix and hand the rest to the shared curl
    // runner with the trace flow forced on. Passing `args` explicitly avoids
    // mutating `client.argv` (which is the live `process.argv` in production).
    const args = client.argv.slice(4);
    return runCurl(client, { forceTrace: true, args });
  }

  if (subcommand === searchSubcommandMetadata.name) {
    telemetry.trackCliSubcommandSearch(subcommandOriginal || subcommand);
    return search(client, telemetry);
  }

  if (subcommandOriginal === 'get') {
    warnDeprecatedSubcommand(client, 'traces get', 'traces inspect');
  }
  return get(client, telemetry);
}
