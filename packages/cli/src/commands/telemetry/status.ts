import chalk from 'chalk';
import Client from '../../util/client';
import output from '../../output-manager';

export default async function status(client: Client) {
  const status: 'disabled' | 'enabled' =
    client.config.telemetry?.enabled === false ? 'disabled' : 'enabled';

  const message =
    status === 'disabled' ? chalk.red('Disabled') : chalk.green('Enabled');
  output.print(`\n${chalk.bold('Telemetry status')}: ${message}\n\n`);

  // TODO: enable this message when we have a proper URL
  // const learnMoreMessage = `\n\nLearn more: ${chalk.cyan(`https://vercel.com/some-link`)}\n`;
  const learnMoreMessage = ``;
  const optedInMessage = `You have opted in to Vercel CLI telemetry${learnMoreMessage}`;
  const optedOutMessage = `You have opted out of Vercel CLI telemetry\nNo data will be collected from your machine${learnMoreMessage}`;
  const optedInorOutMessage =
    status === 'disabled' ? optedOutMessage : optedInMessage;
  output.print(optedInorOutMessage);

  return 0;
}
