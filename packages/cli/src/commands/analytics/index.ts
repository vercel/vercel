import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import { type Command, help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { getCommandAliases } from '..';
import output from '../../output-manager';
import status from './status';
import enable from './enable';
import disable from './disable';
import {
  analyticsCommand,
  statusSubcommand,
  enableSubcommand,
  disableSubcommand,
  alertsSubcommand,
  alertsListSubcommand,
  alertsGetSubcommand,
  alertsCreateSubcommand,
  alertsUpdateSubcommand,
  alertsDeleteSubcommand,
  alertsValidateWebhookSubcommand,
} from './command';

const COMMAND_CONFIG = {
  status: getCommandAliases(statusSubcommand),
  enable: getCommandAliases(enableSubcommand),
  disable: getCommandAliases(disableSubcommand),
  alerts: getCommandAliases(alertsSubcommand),
};

const ALERTS_CONFIG = {
  list: getCommandAliases(alertsListSubcommand),
  get: getCommandAliases(alertsGetSubcommand),
  create: getCommandAliases(alertsCreateSubcommand),
  update: getCommandAliases(alertsUpdateSubcommand),
  delete: getCommandAliases(alertsDeleteSubcommand),
  'validate-webhook': getCommandAliases(alertsValidateWebhookSubcommand),
};

export default async function main(client: Client): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(analyticsCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const { subcommand, args } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );
  const needHelp = parsedArgs.flags['--help'];

  function printHelp(command: Command) {
    output.print(
      help(command, {
        parent: analyticsCommand,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  if (!subcommand && needHelp) {
    output.print(help(analyticsCommand, { columns: client.stderr.columns }));
    return 0;
  }

  switch (subcommand) {
    case 'status': {
      if (needHelp) return printHelp(statusSubcommand);
      return status(client, args, parsedArgs.flags);
    }
    case 'enable': {
      if (needHelp) return printHelp(enableSubcommand);
      return enable(client, args, parsedArgs.flags);
    }
    case 'disable': {
      if (needHelp) return printHelp(disableSubcommand);
      return disable(client, args, parsedArgs.flags);
    }
    case 'alerts': {
      const alertsParsed = getSubcommand(args, ALERTS_CONFIG);
      const alertsHelp = alertsParsed.subcommand && needHelp;
      if (alertsHelp && alertsParsed.subcommand === 'list')
        return printHelp(alertsListSubcommand);
      if (alertsHelp && alertsParsed.subcommand === 'get')
        return printHelp(alertsGetSubcommand);
      if (alertsHelp && alertsParsed.subcommand === 'create')
        return printHelp(alertsCreateSubcommand);
      if (alertsHelp && alertsParsed.subcommand === 'update')
        return printHelp(alertsUpdateSubcommand);
      if (alertsHelp && alertsParsed.subcommand === 'delete')
        return printHelp(alertsDeleteSubcommand);
      if (alertsHelp && alertsParsed.subcommand === 'validate-webhook')
        return printHelp(alertsValidateWebhookSubcommand);
      if (!alertsParsed.subcommand) {
        output.print(
          help(alertsSubcommand, {
            parent: analyticsCommand,
            columns: client.stderr.columns,
          })
        );
        return 0;
      }
      const alertArgs = alertsParsed.args;
      const alertFlags = parsedArgs.flags;
      switch (alertsParsed.subcommand) {
        case 'list':
          return (await import('./alerts/list')).default(
            client,
            alertArgs,
            alertFlags
          );
        case 'get':
          return (await import('./alerts/get')).default(
            client,
            alertArgs,
            alertFlags
          );
        case 'create':
          return (await import('./alerts/create')).default(
            client,
            alertArgs,
            alertFlags
          );
        case 'update':
          return (await import('./alerts/update')).default(
            client,
            alertArgs,
            alertFlags
          );
        case 'delete':
        case 'rm':
        case 'remove':
          return (await import('./alerts/delete')).default(
            client,
            alertArgs,
            alertFlags
          );
        case 'validate-webhook':
          return (await import('./alerts/validate-webhook')).default(
            client,
            alertArgs,
            alertFlags
          );
        default:
          output.print(
            help(alertsSubcommand, {
              parent: analyticsCommand,
              columns: client.stderr.columns,
            })
          );
          return 0;
      }
    }
    default: {
      if (needHelp) {
        output.print(
          help(analyticsCommand, { columns: client.stderr.columns })
        );
        return 0;
      }
      return status(client, args, parsedArgs.flags);
    }
  }
}
