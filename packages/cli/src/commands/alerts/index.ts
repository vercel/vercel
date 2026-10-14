import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import { help, type Command } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getCommonArgs from '../../util/arg-common';
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
  findCommandIndex,
  normalizeHelpAlias,
  type FlagsSpecification,
} from '../../util/raw-command-args';
import { printMonitorsHelp } from '../monitors/help';
import { runMonitors } from '../monitors/run';

const COMMAND_CONFIG = {
  inspect: getCommandAliases(inspectSubcommand),
  ls: getCommandAliases(listSubcommand),
  rules: ['rules'],
};

function getAlertsSubcommand(
  rawArgs: string[],
  parsedArgs: string[],
  flagsSpecification: FlagsSpecification
) {
  const commandIndex = findCommandIndex(
    rawArgs,
    parsedArgs[0],
    flagsSpecification
  );
  const rawArgsAfterCommand =
    commandIndex === -1 ? [] : rawArgs.slice(commandIndex + 1);
  const rawSubcommand = rawArgsAfterCommand[0];
  if (!rawSubcommand || rawSubcommand.startsWith('-')) {
    return {
      ...getSubcommand([], COMMAND_CONFIG),
      rawSubcommandArgs: rawArgsAfterCommand,
    };
  }

  return {
    ...getSubcommand(parsedArgs.slice(1), COMMAND_CONFIG),
    rawSubcommandArgs: rawArgsAfterCommand.slice(1),
  };
}

export default async function alerts(client: Client): Promise<number> {
  const telemetry = new AlertsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(alertsCommand.options);
  const rawArgs = normalizeHelpAlias(client.argv.slice(2));
  try {
    parsedArgs = parseArguments(rawArgs, flagsSpecification, {
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

  const { subcommand, args, subcommandOriginal, rawSubcommandArgs } =
    getAlertsSubcommand(rawArgs, parsedArgs.args, {
      ...getCommonArgs(),
      ...flagsSpecification,
    });
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
      printMonitorsHelp(client, args[0]);
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
      return inspectFn(client, rawSubcommandArgs);
    }
    case 'rules': {
      telemetry.trackCliSubcommandRules(args[0] ?? 'ls');
      return runMonitors(client, rawSubcommandArgs);
    }
    default: {
      telemetry.trackCliSubcommandLs(subcommandOriginal);
      const listFn = (await import('./list')).default;
      return listFn(client, telemetry);
    }
  }
}
