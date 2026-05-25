import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import { help, type Command } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { AlertsTelemetryClient } from '../../util/telemetry/commands/alerts';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
  shouldEmitNonInteractiveCommandError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { alertsCommand, inspectSubcommand, listSubcommand } from './command';
import {
  rulesAddSubcommand,
  rulesAggregateCommand,
  rulesInspectSubcommand,
  rulesLsSubcommand,
  rulesRmSubcommand,
  rulesUpdateSubcommand,
} from './rules/command';

const COMMAND_CONFIG = {
  inspect: getCommandAliases(inspectSubcommand),
  ls: getCommandAliases(listSubcommand),
  rules: ['rules'],
};

export default async function alerts(client: Client): Promise<number> {
  const telemetry = new AlertsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(alertsCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const projectFlagMissingArg =
      msg.includes('--project') && msg.includes('requires argument');
    if (shouldEmitNonInteractiveCommandError(client)) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: projectFlagMissingArg
            ? '`--project` requires a project name or id (for example `--project my-app`).'
            : msg,
          next: projectFlagMissingArg
            ? [
                {
                  command: buildCommandWithGlobalFlags(
                    client.argv,
                    'alerts --project <name-or-id>'
                  ),
                  when: 'Re-run with a project name or id (replace placeholder)',
                },
                {
                  command: buildCommandWithGlobalFlags(
                    client.argv,
                    'alerts --help'
                  ),
                  when: 'See all `alerts` flags and examples',
                },
              ]
            : [
                {
                  command: buildCommandWithGlobalFlags(
                    client.argv,
                    'alerts --help'
                  ),
                  when: 'See valid flags and examples',
                },
              ],
        },
        1
      );
    }
    printError(err);
    return 1;
  }

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );
  const needHelp = parsedArgs.flags['--help'];

  function printHelp(command: Command): void {
    output.print(
      help(command, { parent: alertsCommand, columns: client.stderr.columns })
    );
  }

  if (needHelp) {
    if (subcommand === 'inspect') {
      telemetry.trackCliFlagHelp('alerts', 'inspect');
      printHelp(inspectSubcommand);
      return 0;
    }
    if (subcommand === 'rules') {
      telemetry.trackCliFlagHelp('alerts', 'rules');
      const nested = args[0];
      if (nested === 'ls' || nested === 'list') {
        printHelp(rulesLsSubcommand);
        return 0;
      }
      if (nested === 'add' || nested === 'create') {
        printHelp(rulesAddSubcommand);
        return 0;
      }
      if (nested === 'inspect' || nested === 'get') {
        printHelp(rulesInspectSubcommand);
        return 0;
      }
      if (nested === 'rm' || nested === 'remove' || nested === 'delete') {
        printHelp(rulesRmSubcommand);
        return 0;
      }
      if (nested === 'update' || nested === 'patch') {
        printHelp(rulesUpdateSubcommand);
        return 0;
      }
      output.print(
        help(rulesAggregateCommand, {
          parent: alertsCommand,
          columns: client.stderr.columns,
        })
      );
      return 0;
    }
    telemetry.trackCliFlagHelp('alerts', subcommandOriginal);
    output.print(help(alertsCommand, { columns: client.stderr.columns }));
    return 0;
  }

  switch (subcommand) {
    case 'inspect': {
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      const inspectFn = (await import('./inspect')).default;
      return inspectFn(client, args);
    }
    case 'rules': {
      telemetry.trackCliSubcommandRules(args[0] ?? 'ls');
      const rulesFn = (await import('./rules')).default;
      return rulesFn(client, args);
    }
    default: {
      telemetry.trackCliSubcommandLs(subcommandOriginal);
      const listFn = (await import('./list')).default;
      return listFn(client, telemetry);
    }
  }
}
