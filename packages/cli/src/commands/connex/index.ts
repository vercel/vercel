import { getCommandAliases } from '..';
import output from '../../output-manager';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getSubcommand from '../../util/get-subcommand';
import { ConnexTelemetryClient } from '../../util/telemetry/commands/connex';
import { type Command, help } from '../help';
import {
  createSubcommand,
  listSubcommand,
  tokenSubcommand,
  connexCommand,
} from './command';
import { create } from './create';
import { list } from './list';
import { token } from './token';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { packageName } from '../../util/pkg-name';

const COMMAND_CONFIG = {
  create: getCommandAliases(createSubcommand),
  list: getCommandAliases(listSubcommand),
  token: getCommandAliases(tokenSubcommand),
};

export default async function connex(client: Client): Promise<number> {
  const telemetry = new ConnexTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const { args, flags } = parseArguments(
    client.argv.slice(2),
    getFlagsSpecification(connexCommand.options),
    { permissive: true }
  );

  const {
    subcommand,
    subcommandOriginal,
    args: subArgs,
  } = getSubcommand(args.slice(1), COMMAND_CONFIG);

  const needHelp = flags['--help'];

  function printHelp(command: Command) {
    output.print(
      help(command, {
        columns: client.stderr.columns,
        parent: connexCommand,
      })
    );
  }

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('connex');
    output.print(
      help(connexCommand, {
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  try {
    switch (subcommand) {
      case 'create': {
        if (needHelp) {
          telemetry.trackCliFlagHelp('connex', subcommandOriginal);
          printHelp(createSubcommand);
          return 0;
        }
        telemetry.trackCliSubcommandCreate(subcommandOriginal);

        const createFlagsSpec = getFlagsSpecification(createSubcommand.options);
        const createParsedArgs = parseArguments(subArgs, createFlagsSpec);
        return await create(
          client,
          createParsedArgs.args,
          createParsedArgs.flags
        );
      }
      case 'list': {
        if (needHelp) {
          telemetry.trackCliFlagHelp('connex', subcommandOriginal);
          printHelp(listSubcommand);
          return 0;
        }
        telemetry.trackCliSubcommandList(subcommandOriginal);

        const listFlagsSpec = getFlagsSpecification(listSubcommand.options);
        const listParsedArgs = parseArguments(subArgs, listFlagsSpec);
        telemetry.trackCliOptionLimit(listParsedArgs.flags['--limit']);
        telemetry.trackCliOptionNext(listParsedArgs.flags['--next']);
        telemetry.trackCliOptionFormat(listParsedArgs.flags['--format']);
        return await list(client, listParsedArgs.flags);
      }
      case 'token': {
        if (needHelp) {
          telemetry.trackCliFlagHelp('connex', subcommandOriginal);
          printHelp(tokenSubcommand);
          return 0;
        }
        telemetry.trackCliSubcommandToken(subcommandOriginal);

        const tokenFlagsSpec = getFlagsSpecification(tokenSubcommand.options);
        const tokenParsedArgs = parseArguments(subArgs, tokenFlagsSpec);
        return await token(client, tokenParsedArgs.args, tokenParsedArgs.flags);
      }
      default: {
        const validSubcommands = Object.keys(COMMAND_CONFIG).join(' | ');
        const missingSubcommand = subArgs.length === 0;
        const message = missingSubcommand
          ? `Please specify a valid subcommand: ${validSubcommands}`
          : `Unknown subcommand "${subArgs[0]}". Valid subcommands: ${validSubcommands}`;

        outputAgentError(
          client,
          {
            status: 'error',
            reason: missingSubcommand
              ? AGENT_REASON.MISSING_ARGUMENTS
              : AGENT_REASON.INVALID_ARGUMENTS,
            message,
            next: [
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  'connex --help',
                  packageName,
                  { prependGlobalFlags: true }
                ),
                when: 'Show all connex subcommands and options',
              },
            ],
          },
          2
        );
        output.error(message);
        return 2;
      }
    }
  } catch (err) {
    printError(err);
    return 1;
  }
}
