import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { type Command, help } from '../help';
import {
  abortSubcommand,
  approveSubcommand,
  completeSubcommand,
  configureSubcommand,
  fetchSubcommand,
  rollingReleaseCommand,
  startSubcommand,
} from './command';
import requestRollingRelease from './request-rolling-release';
import startRollingRelease from './start-rolling-release';
import configureRollingRelease, {
  buildConfigurePayload,
} from './configure-rolling-release';
import approveRollingRelease from './approve-rolling-release';
import abortRollingRelease from './abort-rolling-release';
import completeRollingRelease from './complete-rolling-release';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { RollingReleaseTelemetryClient } from '../../util/telemetry/commands/rolling-release';
import { getLinkedProject } from '../../util/projects/link';
import getSubcommand from '../../util/get-subcommand';
import { getCommandAliases } from '..';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import { outputAgentError } from '../../util/agent-output';
import { packageName } from '../../util/pkg-name';
import { isAPIError } from '../../util/errors-ts';

const COMMAND_CONFIG = {
  configure: getCommandAliases(configureSubcommand),
  start: getCommandAliases(startSubcommand),
  approve: getCommandAliases(approveSubcommand),
  abort: getCommandAliases(abortSubcommand),
  complete: getCommandAliases(completeSubcommand),
  fetch: getCommandAliases(fetchSubcommand),
};

function buildDeploymentSuggestionCommands(
  client: Client,
  subcmd: 'start' | 'abort' | 'approve' | 'complete'
): { listCommand: string; subcommandCommand: string } {
  const args = client.argv.slice(2);
  const preservedParts: string[] = [];
  let hasNonInteractive = false;
  // args[0] = 'rolling-release', args[1] = subcmd
  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--non-interactive') {
      hasNonInteractive = true;
      continue;
    }
    if (arg.startsWith('--cwd=')) {
      const cwdPath = arg.slice(6);
      if (cwdPath) {
        preservedParts.push('--cwd', cwdPath);
      }
      continue;
    }
    if (arg === '--cwd') {
      if (i + 1 < args.length) {
        preservedParts.push('--cwd', args[i + 1]);
        i++;
      }
      continue;
    }
    preservedParts.push(arg);
  }
  const preservedSuffix = preservedParts.join(' ');
  const listCommand = preservedSuffix
    ? `${packageName} ls ${preservedSuffix}`
    : `${packageName} ls`;
  const base = preservedSuffix
    ? `${packageName} rolling-release ${subcmd} ${preservedSuffix}`
    : `${packageName} rolling-release ${subcmd}`;
  const defaultSuffix =
    subcmd === 'approve'
      ? '--dpl dpl_123 --currentStageIndex=0'
      : '--dpl dpl_123';
  const subcommandCommand = hasNonInteractive
    ? `${base} ${defaultSuffix} --non-interactive`
    : `${base} ${defaultSuffix}`;
  return { listCommand, subcommandCommand };
}

export default async function rollingRelease(client: Client): Promise<number> {
  const telemetry = new RollingReleaseTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const {
    subcommand,
    args: subcommandArgs,
    subcommandOriginal,
  } = getSubcommand(client.argv.slice(3), COMMAND_CONFIG);

  const needHelp = client.argv.includes('--help') || client.argv.includes('-h');

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('rolling-release');
    output.print(
      help(rollingReleaseCommand, { columns: client.stderr.columns })
    );
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        parent: rollingReleaseCommand,
        columns: client.stderr.columns,
      })
    );
  }

  try {
    const link = await getLinkedProject(client);
    if (link.status === 'error') {
      return link.exitCode;
    }
    if (link.status === 'not_linked') {
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: 'not_linked',
            message:
              'No project found for rolling releases. Link your project first.',
            next: [{ command: `${packageName} link` }],
          },
          1
        );
      }
      output.error(
        'No project found. Please run `vc link` to link your project first.'
      );
      return 1;
    }

    const { project, org } = link;
    client.config.currentTeam = org.type === 'team' ? org.id : undefined;

    let subcommandFlags;
    switch (subcommand) {
      case 'configure': {
        if (needHelp) {
          telemetry.trackCliFlagHelp('rolling-release', subcommandOriginal);
          printHelp(configureSubcommand);
          return 2;
        }
        subcommandFlags = parseArguments(
          subcommandArgs,
          getFlagsSpecification(configureSubcommand.options)
        );

        const cfgString = subcommandFlags.flags['--cfg'];
        const enableFlag = subcommandFlags.flags['--enable'];
        const disableFlag = subcommandFlags.flags['--disable'];
        const advancementType = subcommandFlags.flags['--advancement-type'];
        const stageFlags = subcommandFlags.flags['--stage'];

        telemetry.trackCliFlagEnable(enableFlag);
        telemetry.trackCliFlagDisable(disableFlag);
        telemetry.trackCliOptionAdvancementType(advancementType);
        telemetry.trackCliOptionStage(stageFlags);

        const configResult = await buildConfigurePayload({
          client,
          cfgString,
          enableFlag,
          disableFlag,
          advancementType,
          stageFlags,
        });

        if (configResult.exitCode !== undefined) {
          return configResult.exitCode;
        }

        await configureRollingRelease({
          client,
          projectId: project.id,
          teamId: org.id,
          rollingReleaseConfig: configResult.config,
        });
        break;
      }
      case 'start': {
        if (needHelp) {
          telemetry.trackCliFlagHelp('rolling-release', subcommandOriginal);
          printHelp(startSubcommand);
          return 2;
        }
        subcommandFlags = parseArguments(
          subcommandArgs,
          getFlagsSpecification(startSubcommand.options)
        );
        const dpl = subcommandFlags.flags['--dpl'];
        if (dpl === undefined) {
          if (client.nonInteractive) {
            const { listCommand, subcommandCommand } =
              buildDeploymentSuggestionCommands(client, 'start');

            outputAgentError(
              client,
              {
                status: 'error',
                reason: 'missing_flags',
                message:
                  'Starting a rolling release in non-interactive mode requires the --dpl flag.',
                next: [
                  { command: listCommand },
                  { command: subcommandCommand },
                ],
              },
              1
            );
          }
          output.error('starting a rolling release requires --dpl option.');
          return 1;
        }
        try {
          await startRollingRelease({
            client,
            dpl,
            projectId: project.id,
            teamId: project.accountId,
            yes: subcommandFlags.flags['--yes'] ?? false,
          });
        } catch (err: unknown) {
          if (client.nonInteractive && isAPIError(err)) {
            const { listCommand, subcommandCommand } =
              buildDeploymentSuggestionCommands(client, 'start');
            outputAgentError(
              client,
              {
                status: 'error',
                reason: 'api_error',
                message:
                  err.message ||
                  'Starting the rolling release failed for this deployment.',
                next: [
                  { command: listCommand },
                  { command: subcommandCommand },
                ],
              },
              1
            );
            return 1;
          }
          throw err;
        }
        break;
      }
      case 'approve': {
        if (needHelp) {
          telemetry.trackCliFlagHelp('rolling-release', subcommandOriginal);
          printHelp(approveSubcommand);
          return 2;
        }
        subcommandFlags = parseArguments(
          subcommandArgs,
          getFlagsSpecification(approveSubcommand.options)
        );
        const dpl = subcommandFlags.flags['--dpl'];
        const currentStageIndex = subcommandFlags.flags['--currentStageIndex'];
        const activeStageIndex = parseInt(currentStageIndex ?? '');
        if (!dpl) {
          if (client.nonInteractive) {
            const { listCommand, subcommandCommand } =
              buildDeploymentSuggestionCommands(client, 'approve');
            outputAgentError(
              client,
              {
                status: 'error',
                reason: 'missing_flags',
                message:
                  'Approving a rolling release in non-interactive mode requires --dpl and --currentStageIndex.',
                next: [
                  { command: listCommand },
                  { command: subcommandCommand },
                ],
              },
              1
            );
          }
          output.error('Missing required flag --dpl');
          return 1;
        }
        if (currentStageIndex === undefined) {
          if (client.nonInteractive) {
            const { listCommand, subcommandCommand } =
              buildDeploymentSuggestionCommands(client, 'approve');
            outputAgentError(
              client,
              {
                status: 'error',
                reason: 'missing_flags',
                message:
                  'Approving a rolling release in non-interactive mode requires --currentStageIndex.',
                next: [
                  { command: listCommand },
                  { command: subcommandCommand },
                ],
              },
              1
            );
          }
          output.error('Missing required flag --currentStageIndex');
          return 1;
        }
        if (isNaN(activeStageIndex)) {
          if (client.nonInteractive) {
            const { listCommand, subcommandCommand } =
              buildDeploymentSuggestionCommands(client, 'approve');
            outputAgentError(
              client,
              {
                status: 'error',
                reason: 'invalid_flag',
                message: '--currentStageIndex must be a valid number.',
                next: [
                  { command: listCommand },
                  { command: subcommandCommand },
                ],
              },
              1
            );
          }
          output.error('--currentStageIndex must be a valid number.');
          return 1;
        }
        await approveRollingRelease({
          client,
          projectId: project.id,
          teamId: org.id,
          activeStageIndex,
          dpl,
        });
        break;
      }
      case 'abort': {
        if (needHelp) {
          telemetry.trackCliFlagHelp('rolling-release', subcommandOriginal);
          printHelp(abortSubcommand);
          return 2;
        }
        subcommandFlags = parseArguments(
          subcommandArgs,
          getFlagsSpecification(abortSubcommand.options)
        );
        const dpl = subcommandFlags.flags['--dpl'];
        if (!dpl) {
          if (client.nonInteractive) {
            const { listCommand, subcommandCommand } =
              buildDeploymentSuggestionCommands(client, 'abort');
            outputAgentError(
              client,
              {
                status: 'error',
                reason: 'missing_flags',
                message:
                  'Aborting a rolling release in non-interactive mode requires the --dpl flag.',
                next: [
                  { command: listCommand },
                  { command: subcommandCommand },
                ],
              },
              1
            );
          }
          output.error('Missing required flag --dpl');
          return 1;
        }
        try {
          await abortRollingRelease({
            client,
            projectId: project.id,
            teamId: org.id,
            dpl,
          });
        } catch (err: unknown) {
          if (client.nonInteractive && isAPIError(err)) {
            const { listCommand, subcommandCommand } =
              buildDeploymentSuggestionCommands(client, 'abort');
            outputAgentError(
              client,
              {
                status: 'error',
                reason: 'api_error',
                message:
                  err.message ||
                  'Aborting the rolling release failed for this deployment.',
                next: [
                  { command: listCommand },
                  { command: subcommandCommand },
                ],
              },
              1
            );
            return 1;
          }
          throw err;
        }
        break;
      }
      case 'complete': {
        if (needHelp) {
          telemetry.trackCliFlagHelp('rolling-release', subcommandOriginal);
          printHelp(completeSubcommand);
          return 2;
        }
        subcommandFlags = parseArguments(
          subcommandArgs,
          getFlagsSpecification(completeSubcommand.options)
        );
        const dpl = subcommandFlags.flags['--dpl'];
        if (!dpl) {
          if (client.nonInteractive) {
            const { listCommand, subcommandCommand } =
              buildDeploymentSuggestionCommands(client, 'complete');
            outputAgentError(
              client,
              {
                status: 'error',
                reason: 'missing_flags',
                message:
                  'Completing a rolling release in non-interactive mode requires the --dpl flag.',
                next: [
                  { command: listCommand },
                  { command: subcommandCommand },
                ],
              },
              1
            );
          }
          output.error('Missing required flag --dpl');
          return 1;
        }
        await completeRollingRelease({
          client,
          projectId: project.id,
          teamId: org.id,
          dpl,
        });
        break;
      }
      case 'fetch': {
        if (needHelp) {
          telemetry.trackCliFlagHelp('rolling-release', subcommandOriginal);
          printHelp(fetchSubcommand);
          return 2;
        }
        const result = await requestRollingRelease({
          client,
          projectId: project.id,
          teamId: org.id,
        });
        output.log(JSON.stringify(result, null, 2));
        break;
      }
      default: {
        output.debug(`Invalid subcommand: ${subcommand}`);
        output.error(getInvalidSubcommand(COMMAND_CONFIG));
        output.print(
          help(rollingReleaseCommand, { columns: client.stderr.columns })
        );
        return 2;
      }
    }

    return 0;
  } catch (err: unknown) {
    if (client.nonInteractive && isAPIError(err)) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'api_error',
          message: err.message || 'Rolling release command failed.',
        },
        1
      );
    }
    printError(err);
    return 1;
  }
}
