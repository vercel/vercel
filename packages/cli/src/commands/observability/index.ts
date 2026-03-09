import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import { type Command, help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { getCommandAliases } from '..';
import output from '../../output-manager';
import {
  observabilityCommand,
  configSubcommand,
  configGetSubcommand,
  configPatchSubcommand,
  configSetProjectSubcommand,
  notebooksSubcommand,
  notebooksListSubcommand,
  notebooksCreateSubcommand,
  notebooksGetSubcommand,
  notebooksUpdateSubcommand,
  notebooksDeleteSubcommand,
  notebooksShareSubcommand,
  funnelsSubcommand,
  funnelsListSubcommand,
  funnelsCreateSubcommand,
  funnelsGetSubcommand,
  funnelsUpdateSubcommand,
  funnelsDeleteSubcommand,
  querySubcommand,
} from './command';

const COMMAND_CONFIG = {
  config: getCommandAliases(configSubcommand),
  notebooks: getCommandAliases(notebooksSubcommand),
  notebook: getCommandAliases(notebooksSubcommand),
  funnels: getCommandAliases(funnelsSubcommand),
  funnel: getCommandAliases(funnelsSubcommand),
  query: getCommandAliases(querySubcommand),
};

const CONFIG_CONFIG = {
  get: getCommandAliases(configGetSubcommand),
  patch: getCommandAliases(configPatchSubcommand),
  'set-project': getCommandAliases(configSetProjectSubcommand),
};

const NOTEBOOKS_CONFIG = {
  list: getCommandAliases(notebooksListSubcommand),
  ls: getCommandAliases(notebooksListSubcommand),
  create: getCommandAliases(notebooksCreateSubcommand),
  get: getCommandAliases(notebooksGetSubcommand),
  inspect: getCommandAliases(notebooksGetSubcommand),
  update: getCommandAliases(notebooksUpdateSubcommand),
  delete: getCommandAliases(notebooksDeleteSubcommand),
  rm: getCommandAliases(notebooksDeleteSubcommand),
  remove: getCommandAliases(notebooksDeleteSubcommand),
  share: getCommandAliases(notebooksShareSubcommand),
};

const FUNNELS_CONFIG = {
  list: getCommandAliases(funnelsListSubcommand),
  ls: getCommandAliases(funnelsListSubcommand),
  create: getCommandAliases(funnelsCreateSubcommand),
  get: getCommandAliases(funnelsGetSubcommand),
  inspect: getCommandAliases(funnelsGetSubcommand),
  update: getCommandAliases(funnelsUpdateSubcommand),
  delete: getCommandAliases(funnelsDeleteSubcommand),
  rm: getCommandAliases(funnelsDeleteSubcommand),
  remove: getCommandAliases(funnelsDeleteSubcommand),
};

export default async function main(client: Client): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    observabilityCommand.options
  );
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

  function printHelp(cmd: Command, options?: { parent?: Command }) {
    output.print(
      help(cmd, {
        parent: options?.parent ?? observabilityCommand,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  if (!subcommand && needHelp) {
    output.print(
      help(observabilityCommand, { columns: client.stderr.columns })
    );
    return 0;
  }

  const flags = parsedArgs.flags;

  switch (subcommand) {
    case 'config':
    case 'notebooks':
    case 'notebook':
    case 'funnels':
    case 'funnel':
    case 'query': {
      const inner = subcommand;
      if (inner === 'query') {
        if (needHelp) return printHelp(querySubcommand);
        return (await import('./query')).default(client, args, flags);
      }
      if (inner === 'config') {
        const configSub = getSubcommand(args, CONFIG_CONFIG);
        if (needHelp && configSub.subcommand === 'get')
          return printHelp(configGetSubcommand);
        if (needHelp && configSub.subcommand === 'patch')
          return printHelp(configPatchSubcommand);
        if (needHelp && configSub.subcommand === 'set-project')
          return printHelp(configSetProjectSubcommand);
        if (!configSub.subcommand) {
          output.print(
            help(configSubcommand, {
              parent: observabilityCommand,
              columns: client.stderr.columns,
            })
          );
          return 0;
        }
        switch (configSub.subcommand) {
          case 'get':
            return (await import('./config-get')).default(
              client,
              configSub.args,
              flags
            );
          case 'patch':
            return (await import('./config-patch')).default(
              client,
              configSub.args,
              flags
            );
          case 'set-project':
            return (await import('./config-set-project')).default(
              client,
              configSub.args,
              flags
            );
          default:
            return printHelp(configSubcommand);
        }
      }
      if (inner === 'notebooks' || inner === 'notebook') {
        const nbSub = getSubcommand(args, NOTEBOOKS_CONFIG);
        if (needHelp && nbSub.subcommand === 'list')
          return printHelp(notebooksListSubcommand);
        if (needHelp && nbSub.subcommand === 'create')
          return printHelp(notebooksCreateSubcommand);
        if (needHelp && nbSub.subcommand === 'get')
          return printHelp(notebooksGetSubcommand);
        if (needHelp && nbSub.subcommand === 'update')
          return printHelp(notebooksUpdateSubcommand);
        if (needHelp && nbSub.subcommand === 'delete')
          return printHelp(notebooksDeleteSubcommand);
        if (needHelp && nbSub.subcommand === 'share')
          return printHelp(notebooksShareSubcommand);
        if (!nbSub.subcommand) {
          output.print(
            help(notebooksSubcommand, {
              parent: observabilityCommand,
              columns: client.stderr.columns,
            })
          );
          return 0;
        }
        switch (nbSub.subcommand) {
          case 'list':
          case 'ls':
            return (await import('./notebooks-list')).default(
              client,
              nbSub.args,
              flags
            );
          case 'create':
            return (await import('./notebooks-create')).default(
              client,
              nbSub.args,
              flags
            );
          case 'get':
          case 'inspect':
            return (await import('./notebooks-get')).default(
              client,
              nbSub.args,
              flags
            );
          case 'update':
            return (await import('./notebooks-update')).default(
              client,
              nbSub.args,
              flags
            );
          case 'delete':
          case 'rm':
          case 'remove':
            return (await import('./notebooks-delete')).default(
              client,
              nbSub.args,
              flags
            );
          case 'share':
            return (await import('./notebooks-share')).default(
              client,
              nbSub.args,
              flags
            );
          default:
            return printHelp(notebooksSubcommand);
        }
      }
      if (inner === 'funnels' || inner === 'funnel') {
        const fnSub = getSubcommand(args, FUNNELS_CONFIG);
        if (needHelp && fnSub.subcommand === 'list')
          return printHelp(funnelsListSubcommand);
        if (needHelp && fnSub.subcommand === 'create')
          return printHelp(funnelsCreateSubcommand);
        if (needHelp && fnSub.subcommand === 'get')
          return printHelp(funnelsGetSubcommand);
        if (needHelp && fnSub.subcommand === 'update')
          return printHelp(funnelsUpdateSubcommand);
        if (needHelp && fnSub.subcommand === 'delete')
          return printHelp(funnelsDeleteSubcommand);
        if (!fnSub.subcommand) {
          output.print(
            help(funnelsSubcommand, {
              parent: observabilityCommand,
              columns: client.stderr.columns,
            })
          );
          return 0;
        }
        switch (fnSub.subcommand) {
          case 'list':
          case 'ls':
            return (await import('./funnels-list')).default(
              client,
              fnSub.args,
              flags
            );
          case 'create':
            return (await import('./funnels-create')).default(
              client,
              fnSub.args,
              flags
            );
          case 'get':
          case 'inspect':
            return (await import('./funnels-get')).default(
              client,
              fnSub.args,
              flags
            );
          case 'update':
            return (await import('./funnels-update')).default(
              client,
              fnSub.args,
              flags
            );
          case 'delete':
          case 'rm':
          case 'remove':
            return (await import('./funnels-delete')).default(
              client,
              fnSub.args,
              flags
            );
          default:
            return printHelp(funnelsSubcommand);
        }
      }
      return 0;
    }
    default: {
      output.print(
        help(observabilityCommand, { columns: client.stderr.columns })
      );
      return 0;
    }
  }
}
