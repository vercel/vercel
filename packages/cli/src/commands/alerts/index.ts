import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getCommonArgs from '../../util/arg-common';
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
import { runMonitors } from '../monitors/run';
import { ALERT_RULES_API } from '../monitors/util';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';

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
                  when: 'See all `alerts` options and examples',
                },
              ]
            : [
                {
                  command: buildCommandWithGlobalFlags(
                    client.argv,
                    'alerts --help'
                  ),
                  when: 'See valid options and examples',
                },
              ],
        },
        2
      );
    }
    printError(err);
    return 2;
  }

  const { subcommand, subcommandOriginal, rawSubcommandArgs } =
    getAlertsSubcommand(rawArgs, parsedArgs.args, {
      ...getCommonArgs(),
      ...flagsSpecification,
    });
  switch (subcommand) {
    case 'inspect': {
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      const inspectFn = (await import('./inspect')).default;
      return inspectFn(client, rawSubcommandArgs);
    }
    case 'rules': {
      warnDeprecatedSubcommand(client, 'alerts rules', 'monitors');
      return runMonitors(client, rawSubcommandArgs, ALERT_RULES_API);
    }
    default: {
      telemetry.trackCliSubcommandLs(subcommandOriginal);
      const listFn = (await import('./list')).default;
      return listFn(client, telemetry);
    }
  }
}
