import ms from 'ms';
import { parseArguments } from '../../util/get-args';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import { printError } from '../../util/error';
import { isErrnoException } from '@vercel/error-utils';
import requestPromote from './request-promote';
import promoteStatus from './status';
import { promoteCommand, statusSubcommand } from './command';
import { help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { PromoteTelemetryClient } from '../../util/telemetry/commands/promote';
import output from '../../output-manager';
import type Client from '../../util/client';

/**
 * `vc promote` command
 * @param {Client} client
 * @returns {Promise<number>} Resolves an exit code; 0 on success
 */
export default async (client: Client): Promise<number> => {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(promoteCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const telemetry = new PromoteTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const needHelp = parsedArgs.flags['--help'];

  if (!parsedArgs.args[1] && needHelp) {
    telemetry.trackCliFlagHelp('promote');
    output.print(help(promoteCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const yes = parsedArgs.flags['--yes'] ?? false;
  telemetry.trackCliFlagYes(parsedArgs.flags['--yes']);

  // validate the timeout
  const timeout = parsedArgs.flags['--timeout'];
  if (timeout && ms(timeout) === undefined) {
    output.error(`Invalid timeout "${timeout}"`);
    return 1;
  }

  telemetry.trackCliOptionTimeout(parsedArgs.flags['--timeout']);

  const actionOrDeployId = parsedArgs.args[1] || 'status';

  try {
    if (actionOrDeployId === 'status') {
      if (needHelp) {
        telemetry.trackCliFlagHelp('promote', 'status');
        output.print(
          help(statusSubcommand, {
            columns: client.stderr.columns,
            parent: promoteCommand,
          })
        );
        return 2;
      }
      telemetry.trackCliSubcommandStatus();
      const project = await getProjectByCwdOrLink({
        autoConfirm: parsedArgs.flags['--yes'],
        client,
        commandName: 'promote',
        projectNameOrId: parsedArgs.args[2],
      });

      return await promoteStatus({
        client,
        project,
        timeout,
      });
    }

    telemetry.trackCliArgumentUrlOrDeploymentId(actionOrDeployId);
    return await requestPromote({
      client,
      deployId: actionOrDeployId,
      timeout,
      yes,
    });
  } catch (err) {
    if (isErrnoException(err)) {
      if (err.code === 'ERR_CANCELED') {
        return 0;
      }
      if (err.code === 'ERR_INVALID_CWD' || err.code === 'ERR_LINK_PROJECT') {
        // do not show the message
        return 1;
      }
    }

    output.prettyError(err);
    return 1;
  }
};
