import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import getInvalidSubcommand from '../../../util/get-invalid-subcommand';
import getSubcommand from '../../../util/get-subcommand';
import { printError } from '../../../util/error';
import { type Command, help } from '../../help';
import list from './list';
import inspect from './inspect';
import add from './add';
import edit from './edit';
import enable from './enable';
import disable from './disable';
import remove from './remove';
import reorder from './reorder';
import {
  firewallCommand,
  rulesSubcommand,
  rulesListSubcommand,
  rulesInspectSubcommand,
  rulesAddSubcommand,
  rulesEditSubcommand,
  rulesEnableSubcommand,
  rulesDisableSubcommand,
  rulesRemoveSubcommand,
  rulesReorderSubcommand,
} from '../command';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import output from '../../../output-manager';
import { getCommandAliases } from '../..';
import { warnDeprecatedSubcommand } from '../../../util/warn-deprecated-subcommand';
import type { FirewallTelemetryClient } from '../../../util/telemetry/commands/firewall';

const COMMAND_CONFIG = {
  list: getCommandAliases(rulesListSubcommand),
  inspect: getCommandAliases(rulesInspectSubcommand),
  add: getCommandAliases(rulesAddSubcommand),
  update: getCommandAliases(rulesEditSubcommand),
  enable: getCommandAliases(rulesEnableSubcommand),
  disable: getCommandAliases(rulesDisableSubcommand),
  remove: getCommandAliases(rulesRemoveSubcommand),
  move: getCommandAliases(rulesReorderSubcommand),
};

export default async function main(
  client: Client,
  args: string[],
  telemetry: FirewallTelemetryClient
) {
  const flagsSpecification = getFlagsSpecification(rulesSubcommand.options);
  let parsedArgs;
  try {
    parsedArgs = parseArguments(args, flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 2;
  }

  const {
    subcommand,
    args: subArgs,
    subcommandOriginal,
  } = getSubcommand(parsedArgs.args, COMMAND_CONFIG);

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('firewall', 'rules');
    output.print(
      help(rulesSubcommand, {
        stream: client.stderr,
        parent: firewallCommand,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        stream: client.stderr,
        parent: firewallCommand,
        columns: client.stderr.columns,
      })
    );
  }

  switch (subcommand) {
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp('firewall', `rules:${subcommandOriginal}`);
        printHelp(rulesListSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandRulesList(subcommandOriginal);
      return list(client, subArgs);
    case 'inspect':
      if (needHelp) {
        telemetry.trackCliFlagHelp('firewall', `rules:${subcommandOriginal}`);
        printHelp(rulesInspectSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandRulesInspect(subcommandOriginal);
      return inspect(client, subArgs);
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('firewall', `rules:${subcommandOriginal}`);
        printHelp(rulesAddSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandRulesAdd(subcommandOriginal);
      return add(client, subArgs);
    case 'update':
      if (needHelp) {
        telemetry.trackCliFlagHelp('firewall', `rules:${subcommandOriginal}`);
        printHelp(rulesEditSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandRulesUpdate(subcommandOriginal);
      if (subcommandOriginal === 'edit') {
        warnDeprecatedSubcommand(
          client,
          'firewall rules edit',
          'firewall rules update'
        );
      }
      return edit(client, subArgs);
    case 'enable':
      if (needHelp) {
        telemetry.trackCliFlagHelp('firewall', `rules:${subcommandOriginal}`);
        printHelp(rulesEnableSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandRulesEnable(subcommandOriginal);
      return enable(client, subArgs);
    case 'disable':
      if (needHelp) {
        telemetry.trackCliFlagHelp('firewall', `rules:${subcommandOriginal}`);
        printHelp(rulesDisableSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandRulesDisable(subcommandOriginal);
      return disable(client, subArgs);
    case 'remove':
      if (needHelp) {
        telemetry.trackCliFlagHelp('firewall', `rules:${subcommandOriginal}`);
        printHelp(rulesRemoveSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandRulesRemove(subcommandOriginal);
      if (subcommandOriginal === 'delete') {
        warnDeprecatedSubcommand(
          client,
          'firewall rules delete',
          'firewall rules remove'
        );
      }
      return remove(client, subArgs);
    case 'move':
      if (needHelp) {
        telemetry.trackCliFlagHelp('firewall', `rules:${subcommandOriginal}`);
        printHelp(rulesReorderSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandRulesMove(subcommandOriginal);
      if (subcommandOriginal === 'reorder') {
        warnDeprecatedSubcommand(
          client,
          'firewall rules reorder',
          'firewall rules move'
        );
      }
      return reorder(client, subArgs);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(rulesSubcommand, {
          stream: client.stderr,
          parent: firewallCommand,
          columns: client.stderr.columns,
        })
      );
      return 2;
  }
}
