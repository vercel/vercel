import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';

export default async function status(client: Client) {
  const enabled = client.config.guidance?.enabled !== false;

  const status = enabled ? chalk.green('Enabled') : chalk.red('Disabled');
  output.print('\n');
  output.log(`${chalk.bold('Guidance status')}: ${status}`);
  output.print('\n');

  return 0;
}
