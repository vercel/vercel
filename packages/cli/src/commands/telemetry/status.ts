import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';

export default async function status(client: Client) {
  const enabled = client.config.telemetry?.enabled !== false;

  const status = enabled ? chalk.green('Enabled') : chalk.red('Disabled');
  output.print('\n');
  output.log(`${chalk.bold('Telemetry status')}: ${status}\n`);

  // TODO: enable this message when we have a proper URL
  // const learnMoreMessage = `\n\nLearn more: ${chalk.cyan(`https://vercel.com/some-link`)}\n`;
  const learnMoreMessage = ``;

  if (enabled) {
    output.log(`You have opted in to Vercel CLI telemetry${learnMoreMessage}.`);
  } else {
    output.log('You have opted out of Vercel CLI telemetry.');
    output.log(
      `No data will be collected from your machine${learnMoreMessage}.`
    );
  }

  return 0;
}
