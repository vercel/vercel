import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { help } from '../help';
import { metricsCommand, querySubcommand, schemaSubcommand } from './command';
import { getCommandAliases } from '..';
import output from '../../output-manager';
import { MetricsTelemetryClient } from '../../util/telemetry/commands/metrics';
import { printError } from '../../util/error';
import type { Command } from '../help';

const COMMAND_CONFIG = {
  query: getCommandAliases(querySubcommand),
  schema: getCommandAliases(schemaSubcommand),
};

export default async function metrics(client: Client): Promise<number> {
  const telemetry = new MetricsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(metricsCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const subArgs = parsedArgs.args.slice(1);
  const { subcommand, subcommandOriginal } = getSubcommand(
    subArgs,
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('metrics', subcommand);
    output.print(help(metricsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printSubHelp(command: Command) {
    output.print(
      help(command, {
        parent: metricsCommand,
        columns: client.stderr.columns,
      })
    );
  }

  switch (subcommand) {
    case 'schema': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('metrics', subcommandOriginal);
        printSubHelp(schemaSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandSchema(subcommandOriginal);
      const schemaFn = (await import('./schema')).default;
      return schemaFn(client, telemetry);
    }
    default: {
      // query is the default subcommand
      if (needHelp) {
        telemetry.trackCliFlagHelp('metrics', subcommandOriginal);
        printSubHelp(querySubcommand);
        return 2;
      }
      if (subcommand === 'query') {
        telemetry.trackCliSubcommandQuery(subcommandOriginal);
      }
      const queryFn = (await import('./query')).default;
      return queryFn(client, telemetry);
    }
  }
}
