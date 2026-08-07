import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import add from './rules-add';
import list from './rules-list';
import edit from './rules-edit';
import remove from './rules-remove';
import {
  rulesSubcommand,
  rulesAddSubcommand,
  rulesListSubcommand,
  rulesEditSubcommand,
  rulesRemoveSubcommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { AiGatewayRulesTelemetryClient } from '../../util/telemetry/commands/ai-gateway/rules';
import { printError } from '../../util/error';

const COMMAND_CONFIG = {
  add: getCommandAliases(rulesAddSubcommand),
  list: getCommandAliases(rulesListSubcommand),
  edit: getCommandAliases(rulesEditSubcommand),
  remove: getCommandAliases(rulesRemoveSubcommand),
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
      'AI Gateway routing rules are in beta and may change. Avoid relying on them in production. Share feedback at https://vercel.com/feedback'
    );
  }

  switch (subcommand) {
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ai-gateway rules', subcommandOriginal);
        printHelp(rulesAddSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return add(client, args);
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ai-gateway rules', subcommandOriginal);
        printHelp(rulesListSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list(client, args);
    case 'edit':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ai-gateway rules', subcommandOriginal);
        printHelp(rulesEditSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandEdit(subcommandOriginal);
      return edit(client, args);
    case 'remove':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ai-gateway rules', subcommandOriginal);
        printHelp(rulesRemoveSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return remove(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(rulesSubcommand, { columns: client.stderr.columns }));
      return 2;
  }
}
