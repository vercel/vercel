import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import handleError from '../../util/handle-error';
import { isErrnoException } from '@vercel/error-utils';
import ms from 'ms';
import requestRollback from './request-rollback';
import rollbackStatus from './status';
import { help } from '../help';
import { rollbackCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { RollbackTelemetryClient } from '../../util/telemetry/commands/rollback';
import output from '../../output-manager';

/**
 * `vc rollback` command
 * @param {Client} client
 * @returns {Promise<number>} Resolves an exit code; 0 on success
 */
export default async (client: Client): Promise<number> => {
  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(rollbackCommand.options);
  const telemetry = new RollbackTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  // Parse CLI args
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    handleError(error);
    return 1;
  }

  const actionOrDeployId = parsedArgs.args[1] || 'status';

  telemetry.trackCliOptionTimeout(parsedArgs.flags['--timeout']);
  telemetry.trackCliFlagYes(parsedArgs.flags['--yes']);

  if (parsedArgs.flags['--help']) {
    const subcommand = actionOrDeployId === 'status' ? 'status' : undefined;
    telemetry.trackCliFlagHelp('rollback', subcommand);
    output.print(help(rollbackCommand, { columns: client.stderr.columns }));
    return 2;
  }

  // validate the timeout
  let timeout = parsedArgs.flags['--timeout'];
  if (timeout && ms(timeout) === undefined) {
    output.error(`Invalid timeout "${timeout}"`);
    return 1;
  }

  try {
    if (actionOrDeployId === 'status') {
      telemetry.trackCliSubcommandStatus();
      const project = await getProjectByCwdOrLink({
        autoConfirm: Boolean(parsedArgs.flags['--yes']),
        client,
        commandName: 'promote',
        cwd: client.cwd,
        projectNameOrId: parsedArgs.args[2],
      });

      return await rollbackStatus({
        client,
        project,
        timeout,
      });
    }

    return await requestRollback({
      client,
      deployId: actionOrDeployId,
      timeout,
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
