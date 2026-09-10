import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { isGuidanceEnabled } from '../../util/guidance/is-enabled';

export default async function status(client: Client) {
  const enabled = isGuidanceEnabled(client, undefined, true);

  const status = enabled ? chalk.green('Enabled') : chalk.red('Disabled');
  output.print('\n');
  output.log(`${chalk.bold('Guidance status')}: ${status}`);
  output.print('\n');

  return 0;
}
