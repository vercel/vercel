import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import {
  sendDaemonMessage,
  isDaemonRunning,
} from '../../util/daemon/ipc-client';
import { daemonCommand } from './command';

export default async function status(
  client: Client,
  args: string[]
): Promise<number> {
  const statusSubcommand = daemonCommand.subcommands!.find(
    sub => sub.name === 'status'
  )!;

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(statusSubcommand.options);

  try {
    parsedArgs = parseArguments(args, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const jsonOutput = parsedArgs.flags['--json'] === true;

  // Check if daemon is running
  try {
    const isRunning = await isDaemonRunning();
    if (!isRunning) {
      if (jsonOutput) {
        output.print(JSON.stringify({ status: 'not_running' }, null, 2));
      } else {
        output.log('Daemon is not running');
      }
      return 0;
    }
  } catch (err) {
    if (jsonOutput) {
      output.print(JSON.stringify({ status: 'not_running' }, null, 2));
    } else {
      output.log('Daemon is not running');
    }
    return 0;
  }

  // Get detailed status from daemon
  try {
    const response = await sendDaemonMessage({ type: 'status' });

    if (!response.success) {
      output.error(`Failed to get status: ${response.error}`);
      return 1;
    }

    if (jsonOutput) {
      output.print(JSON.stringify(response.data, null, 2));
    } else {
      const data = response.data;
      output.log('Daemon is running');
      output.log(`Tracked projects: ${data.projects?.length || 0}`);
      if (data.oauth) {
        output.log(
          `OAuth token: ${data.oauth.valid ? 'Valid' : 'Invalid'}${
            data.oauth.expiresAt
              ? ` (expires: ${new Date(data.oauth.expiresAt * 1000).toLocaleString()})`
              : ''
          }`
        );
      }
    }

    return 0;
  } catch (err) {
    output.error(
      `Failed to get status: ${err instanceof Error ? err.message : String(err)}`
    );
    return 1;
  }
}
