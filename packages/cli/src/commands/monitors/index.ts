import type Client from '../../util/client';
import { isArgumentError, takeCommand } from '../../util/get-args';
import { printError } from '../../util/error';
import { monitorsRoutingFlags, runMonitors } from './run';
import { MONITORS_API } from './util';

export default async function monitors(client: Client): Promise<number> {
  try {
    const group = takeCommand(client.argv.slice(2), monitorsRoutingFlags);
    return await runMonitors(client, group.args, MONITORS_API);
  } catch (err) {
    printError(err);
    return isArgumentError(err) ? 2 : 1;
  }
}
