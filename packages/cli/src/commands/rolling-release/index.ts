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

const COMMAND_CONFIG = {
  configure: getCommandAliases(configureSubcommand),
  start: getCommandAliases(startSubcommand),
  approve: getCommandAliases(approveSubcommand),
  abort: getCommandAliases(abortSubcommand),
  complete: getCommandAliases(completeSubcommand),
  fetch: getCommandAliases(fetchSubcommand),
};

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
    return 0;
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
          return 0;
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
          return 0;
        }
        subcommandFlags = parseArguments(
          subcommandArgs,
          getFlagsSpecification(startSubcommand.options)
        );
        const dpl = subcommandFlags.flags['--dpl'];
        if (dpl === undefined) {
          output.error('starting a rolling release requires --dpl option.');
          break;
        }
        await startRollingRelease({
          client,
          dpl,
          projectId: project.id,
          teamId: project.accountId,
          yes: subcommandFlags.flags['--yes'] ?? false,
        });
        break;
      }
      case 'approve': {
        if (needHelp) {
          telemetry.trackCliFlagHelp('rolling-release', subcommandOriginal);
          printHelp(approveSubcommand);
          return 0;
        }
        subcommandFlags = parseArguments(
          subcommandArgs,
          getFlagsSpecification(approveSubcommand.options)
        );
        const dpl = subcommandFlags.flags['--dpl'];
        const currentStageIndex = subcommandFlags.flags['--currentStageIndex'];
        const activeStageIndex = parseInt(currentStageIndex ?? '');
        if (!dpl) {
          output.error('Missing required flag --dpl');
          return 1;
        }
        if (currentStageIndex === undefined) {
          output.error('Missing required flag --currentStageIndex');
          return 1;
        }
        if (isNaN(activeStageIndex)) {
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
          return 0;
        }
        subcommandFlags = parseArguments(
          subcommandArgs,
          getFlagsSpecification(abortSubcommand.options)
        );
        const dpl = subcommandFlags.flags['--dpl'];
        if (!dpl) {
          output.error('Missing required flag --dpl');
          return 1;
        }
        await abortRollingRelease({
          client,
          projectId: project.id,
          teamId: org.id,
          dpl,
        });
        break;
      }
      case 'complete': {
        if (needHelp) {
          telemetry.trackCliFlagHelp('rolling-release', subcommandOriginal);
          printHelp(completeSubcommand);
          return 0;
        }
        subcommandFlags = parseArguments(
          subcommandArgs,
          getFlagsSpecification(completeSubcommand.options)
        );
        const dpl = subcommandFlags.flags['--dpl'];
        if (!dpl) {
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
          return 0;
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
    printError(err);
    return 1;
  }
}
