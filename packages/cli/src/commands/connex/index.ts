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
  attachSubcommand,
  removeSubcommand,
  openSubcommand,
  connexCommand,
} from './command';
import { create } from './create';
import { list } from './list';
import { token } from './token';
import { attach } from './attach';
import { remove } from './remove';
import { openClient } from './open';
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
  attach: getCommandAliases(attachSubcommand),
  remove: getCommandAliases(removeSubcommand),
  open: getCommandAliases(openSubcommand),
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
        telemetry.trackCliFlagAllProjects(
          listParsedArgs.flags['--all-projects']
        );
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
      case 'attach': {
        if (needHelp) {
          telemetry.trackCliFlagHelp('connex', subcommandOriginal);
          printHelp(attachSubcommand);
          return 0;
        }
        telemetry.trackCliSubcommandAttach(subcommandOriginal);

        const attachFlagsSpec = getFlagsSpecification(attachSubcommand.options);
        const attachParsedArgs = parseArguments(subArgs, attachFlagsSpec);
        telemetry.trackCliArgumentClient(attachParsedArgs.args[0]);
        telemetry.trackCliOptionEnvironment(
          attachParsedArgs.flags['--environment']
        );
        telemetry.trackCliOptionProject(attachParsedArgs.flags['--project']);
        telemetry.trackCliFlagYes(attachParsedArgs.flags['--yes']);
        telemetry.trackCliOptionFormat(attachParsedArgs.flags['--format']);
        return await attach(
          client,
          attachParsedArgs.args,
          attachParsedArgs.flags
        );
      }
      case 'remove': {
        if (needHelp) {
          telemetry.trackCliFlagHelp('connex', subcommandOriginal);
          printHelp(removeSubcommand);
          return 0;
        }
        telemetry.trackCliSubcommandRemove(subcommandOriginal);

        const removeFlagsSpec = getFlagsSpecification(removeSubcommand.options);
        const removeParsedArgs = parseArguments(subArgs, removeFlagsSpec);
        telemetry.trackCliArgumentClient(removeParsedArgs.args[0]);
        telemetry.trackCliFlagYes(removeParsedArgs.flags['--yes']);
        telemetry.trackCliFlagDisconnectAll(
          removeParsedArgs.flags['--disconnect-all']
        );
        telemetry.trackCliOptionFormat(removeParsedArgs.flags['--format']);
        return await remove(
          client,
          removeParsedArgs.args,
          removeParsedArgs.flags
        );
      }
      case 'open': {
        if (needHelp) {
          telemetry.trackCliFlagHelp('connex', subcommandOriginal);
          printHelp(openSubcommand);
          return 0;
        }
        telemetry.trackCliSubcommandOpen(subcommandOriginal);

        const openFlagsSpec = getFlagsSpecification(openSubcommand.options);
        const openParsedArgs = parseArguments(subArgs, openFlagsSpec);
        telemetry.trackCliOptionFormat(openParsedArgs.flags['--format']);
        return await openClient(
          client,
          openParsedArgs.args,
          openParsedArgs.flags
        );
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
                  'connect --help',
                  packageName,
                  { prependGlobalFlags: true }
                ),
                when: 'Show all connect subcommands and options',
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
