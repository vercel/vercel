import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { help } from '../help';
import { rollingReleaseCommand } from './command';
import requestRollingRelease from './request-rolling-release';
import startRollingRelease from './start-rolling-release';
import configureRollingRelease from './configure-rolling-release';
import approveRollingRelease from './approve-rolling-release';
import abortRollingRelease from './abort-rolling-release';
import completeRollingRelease from './complete-rolling-release';
import { printError } from '../../util/error';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import { RollingReleaseTelemetryClient } from '../../util/telemetry/commands/rolling-release';

export default async (client: Client): Promise<number> => {
  const telemetry = new RollingReleaseTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });
  let parsedArguments = null;

  const flagsSpecification = getFlagsSpecification(
    rollingReleaseCommand.options
  );

  // #region Argument Parsing
  try {
    parsedArguments = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArguments.flags['--help']) {
    output.print(
      help(rollingReleaseCommand, { columns: client.stderr.columns })
    );
    return 2;
  }

  const projectNameOrId = parsedArguments.flags['--name'];
  const currentStageIndex = parsedArguments.flags['--currentStageIndex'];
  const activeStageIndex = parseInt(currentStageIndex ?? '');
  const deployId = parsedArguments.flags['--deployId'];
  const cfgString = parsedArguments.flags['--cfg'];
  let cfg = undefined;

  telemetry.trackCliOptionName(projectNameOrId);
  telemetry.trackCliOptionAction(parsedArguments.flags['--action']);
  telemetry.trackCliOptionDeployId(deployId);
  telemetry.trackCliOptionCfg(cfgString);
  telemetry.trackCliOptionCurrentStageIndex(currentStageIndex);
  // #endregion

  // retrieve `project`
  const project = await getProjectByCwdOrLink({
    client,
    commandName: 'rolling-release',
    projectNameOrId,
  });

  switch (parsedArguments.flags['--action']) {
    case 'configure':
      if (cfgString === undefined) {
        output.error('configuring a rolling release requires --cfg option.');
        break;
      }
      // allow for a user to pass in disable to disable rolling releases
      if (cfgString !== 'disable') {
        try {
          cfg = JSON.parse(cfgString);
        } catch (e) {
          output.error(`unable to parse cfg: ${cfg}, err: ${e}`);
          break;
        }
      }

      try {
        await configureRollingRelease({
          client,
          projectId: project.id,
          teamId: project.accountId,
          rollingReleaseConfig: cfg,
        });
      } catch (e) {
        output.error(`unable to set cfg: ${JSON.stringify(cfg)}, err: ${e}`);
      }

      break;
    case 'start':
      if (deployId === undefined) {
        output.error('starting a rolling release requires --deployId option.');
        break;
      }
      await startRollingRelease({
        client,
        deployId,
        projectId: project.id,
        teamId: project.accountId,
      });
      break;
    case 'abort':
      if (deployId === undefined) {
        output.error('aborting a rolling release requires --deployId option.');
        break;
      }
      await abortRollingRelease({
        client,
        projectId: project.id,
        deployId,
        teamId: project.accountId,
      });
      break;
    case 'approve':
      if (deployId === undefined) {
        output.error('approving a rolling release requires --deployId option.');
        break;
      }
      if (currentStageIndex === undefined) {
        output.error(
          'approving a rolling release stage requires --currentStageIndex option.'
        );
        break;
      }
      if (isNaN(activeStageIndex)) {
        output.error(
          'approving a rolling release stage requires --currentStageIndex to be an int.'
        );
        break;
      }
      await approveRollingRelease({
        client,
        projectId: project.id,
        teamId: project.accountId,
        activeStageIndex,
        deployId,
      });
      break;
    case 'complete':
      if (deployId === undefined) {
        output.error(
          'completing a rolling release requires --deployId option.'
        );
        break;
      }
      await completeRollingRelease({
        client,
        projectId: project.id,
        teamId: project.accountId,
        deployId,
      });
      break;
    case 'fetch':
      output.log(
        JSON.stringify(
          await requestRollingRelease({
            client,
            projectId: project.id,
            teamId: project.accountId,
          })
        )
      );
      break;
    default:
      output.log('Need to supply --action');
  }

  return 0;
};
