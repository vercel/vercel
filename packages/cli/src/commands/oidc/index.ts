import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import { type Command, help } from '../help';
import token from './token';
import { oidcCommand, tokenSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { OidcTelemetryClient } from '../../util/telemetry/commands/oidc';
import { getCommandAliases } from '..';

const COMMAND_CONFIG = {
  token: getCommandAliases(tokenSubcommand),
};

export default async function main(client: Client) {
  const telemetry = new OidcTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(oidcCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const subArgs = parsedArgs.args.slice(1);
  const { subcommand, args, subcommandOriginal } = getSubcommand(
    subArgs,
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('oidc', subcommand);
    output.print(help(oidcCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, { parent: oidcCommand, columns: client.stderr.columns })
    );
  }

  switch (subcommand) {
    case 'token':
      if (needHelp) {
        telemetry.trackCliFlagHelp('oidc', subcommandOriginal);
        printHelp(tokenSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandToken(subcommandOriginal);
      return token(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(oidcCommand, { columns: client.stderr.columns }));
      return 2;
  }
}
