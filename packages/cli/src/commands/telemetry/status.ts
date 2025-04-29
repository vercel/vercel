import pc from 'picocolors';
import output from '../../output-manager';
import type Client from '../../util/client';

export default async function status(client: Client) {
  const enabled = client.config.telemetry?.enabled !== false;

  const status = enabled ? pc.green('Enabled') : pc.red('Disabled');
  output.print('\n');
  output.log(`${pc.bold('Telemetry status')}: ${status}\n`);

  const learnMoreMessage = `\n\nLearn more: ${pc.cyan('https://vercel.com/docs/cli/about-telemetry')}`;

  if (enabled) {
    output.log(`You have opted in to Vercel CLI telemetry${learnMoreMessage}`);
  } else {
    output.log('You have opted out of Vercel CLI telemetry');
    output.log(
      `No data will be collected from your machine${learnMoreMessage}`
    );
  }

  return 0;
}
