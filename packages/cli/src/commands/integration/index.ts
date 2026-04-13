import { getCommandAliases } from '..';
import output from '../../output-manager';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getSubcommand from '../../util/get-subcommand';
import { IntegrationTelemetryClient } from '../../util/telemetry/commands/integration';
import { type Command, help } from '../help';
import { add } from './add';
import { balance } from './balance';
import {
  acceptTermsSubcommand,
  addSubcommand,
  balanceSubcommand,
  discoverSubcommand,
  guideSubcommand,
  installationsSubcommand,
  integrationCommand,
  listSubcommand,
  openSubcommand,
  removeSubcommand,
  updateSubcommand,
} from './command';
import { list } from './list';
import { openIntegration } from './open-integration';
import { remove } from './remove-integration';
import { update } from './update-integration';
import { discover } from './discover';
import { guide } from './guide';
import { printAddDynamicHelp } from './add-help';
import installationsList from './installations-list';
import acceptTerms from './accept-terms';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { packageName } from '../../util/pkg-name';

const COMMAND_CONFIG = {
  add: getCommandAliases(addSubcommand),
  'accept-terms': getCommandAliases(acceptTermsSubcommand),
  open: getCommandAliases(openSubcommand),
  list: getCommandAliases(listSubcommand),
  installations: getCommandAliases(installationsSubcommand),
  discover: getCommandAliases(discoverSubcommand),
  guide: getCommandAliases(guideSubcommand),
  balance: getCommandAliases(balanceSubcommand),
  remove: getCommandAliases(removeSubcommand),
  update: getCommandAliases(updateSubcommand),
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

  const needHelp = flags['--help'];

  function printHelp(command: Command) {
    output.print(
      help(command, {
        columns: client.stderr.columns,
        parent: integrationCommand,
      })
    );
  }

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('integration');
    output.print(
      help(integrationCommand, {
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  switch (subcommand) {
    case 'add': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);

        const printed = await printAddDynamicHelp(
          client,
          subArgs[0],
          addSubcommand,
          cmd => printHelp(cmd),
          'integration add'
        );

        if (!printed) {
          printHelp(addSubcommand);
        }

        return 0;
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);

      // Parse add-specific flags from subArgs (which contains everything after 'add')
      const addFlagsSpec = getFlagsSpecification(addSubcommand.options);
      let addParsedArgs;
      try {
        addParsedArgs = parseArguments(subArgs, addFlagsSpec);
      } catch (error) {
        printError(error);
        return 1;
      }

      return add(
        client,
        addParsedArgs.args,
        addParsedArgs.flags,
        'integration add'
      );
    }
    case 'accept-terms': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);
        printHelp(acceptTermsSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandAcceptTerms(subcommandOriginal);
      return acceptTerms(client, subArgs);
    }
    case 'list': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);
        printHelp(listSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list(client);
    }
    case 'installations': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);
        printHelp(installationsSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandInstallations(subcommandOriginal);
      return installationsList(client, subArgs);
    }
    case 'discover': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);
        printHelp(discoverSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandDiscover(subcommandOriginal);
      return discover(client, subArgs);
    }
    case 'guide': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);
        printHelp(guideSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandGuide(subcommandOriginal);
      return guide(client, subArgs);
    }
    case 'balance': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);
        printHelp(balanceSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandBalance(subcommandOriginal);
      return balance(client);
    }
    case 'open': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);
        printHelp(openSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandOpen(subcommandOriginal);
      return openIntegration(client, subArgs);
    }
    case 'remove': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);
        printHelp(removeSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return remove(client, subArgs);
    }
    case 'update': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);
        printHelp(updateSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandUpdate(subcommandOriginal);
      return update(client, subArgs);
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
          hint: missingSubcommand
            ? `Pass a subcommand after \`integration\`, for example \`${packageName} integration installations\` or \`${packageName} integration list\`. Global flags such as \`--cwd\` may appear anywhere.`
            : `Check the spelling or run \`${packageName} integration --help\` for the list of subcommands.`,
          next: [
            {
              command: buildCommandWithGlobalFlags(
                client.argv,
                'integration --help',
                packageName,
                { prependGlobalFlags: true }
              ),
              when: 'Show all integration subcommands and options',
            },
            ...(missingSubcommand
              ? [
                  {
                    command: buildCommandWithGlobalFlags(
                      client.argv,
                      'integration installations',
                      packageName,
                      { prependGlobalFlags: true }
                    ),
                    when: 'List marketplace installations for the current team',
                  },
                ]
              : []),
          ],
        },
        2
      );
      output.error(message);
      return 2;
    }
  }
}
