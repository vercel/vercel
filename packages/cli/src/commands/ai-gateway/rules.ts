import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import create from './rules-create';
import list from './rules-list';
import update from './rules-update';
import remove from './rules-delete';
import {
  rulesSubcommand,
  rulesCreateSubcommand,
  rulesListSubcommand,
  rulesUpdateSubcommand,
  rulesDeleteSubcommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { AiGatewayRulesTelemetryClient } from '../../util/telemetry/commands/ai-gateway/rules';
import { printError } from '../../util/error';

const COMMAND_CONFIG = {
  create: getCommandAliases(rulesCreateSubcommand),
  list: getCommandAliases(rulesListSubcommand),
  update: getCommandAliases(rulesUpdateSubcommand),
  delete: getCommandAliases(rulesDeleteSubcommand),
};

export default async function rules(client: Client) {
  const telemetry = new AiGatewayRulesTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(rulesSubcommand.options);
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const subArgs = parsedArgs.args.slice(2);
  const { subcommand, args, subcommandOriginal } = getSubcommand(
    subArgs,
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('ai-gateway rules', subcommandOriginal);
    output.print(help(rulesSubcommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        parent: rulesSubcommand,
        columns: client.stderr.columns,
      })
    );
  }

  if (subcommand && !needHelp) {
    output.warn(
      'AI Gateway routing rules are in beta and may change. Avoid relying on them in production.'
    );
  }

  switch (subcommand) {
    case 'create':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ai-gateway rules', subcommandOriginal);
        printHelp(rulesCreateSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandCreate(subcommandOriginal);
      return create(client, args);
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ai-gateway rules', subcommandOriginal);
        printHelp(rulesListSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list(client, args);
    case 'update':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ai-gateway rules', subcommandOriginal);
        printHelp(rulesUpdateSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandUpdate(subcommandOriginal);
      return update(client, args);
    case 'delete':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ai-gateway rules', subcommandOriginal);
        printHelp(rulesDeleteSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandDelete(subcommandOriginal);
      return remove(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(rulesSubcommand, { columns: client.stderr.columns }));
      return 2;
  }
}
