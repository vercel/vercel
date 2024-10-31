import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';

export default async function status(client: Client) {
  const disabled = client.config.telemetry?.enabled === false;

  const status = disabled ? chalk.red('Disabled') : chalk.green('Enabled');
  output.print('\n');
  output.log(`${chalk.bold('Telemetry status')}: ${status}\n`);

  // TODO: enable this message when we have a proper URL
  // const learnMoreMessage = `\n\nLearn more: ${chalk.cyan(`https://vercel.com/some-link`)}\n`;
  const learnMoreMessage = ``;

  if (disabled) {
    output.log('You have opted out of Vercel CLI telemetry.');
    output.log(
      `No data will be collected from your machine${learnMoreMessage}.`
    );
  } else {
    output.log(`You have opted in to Vercel CLI telemetry${learnMoreMessage}.`);
  }

  return 0;
}
