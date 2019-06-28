import chalk from 'chalk';
import * as configFiles from '../config/files'
import metrics from '../metrics';
import { GA_TRACKING_ID } from '../constants'

const config: any = configFiles.getConfigFilePath();
const shouldCollectMetrics = (
  config.collectMetrics === undefined
  || config.collectMetrics === true)
  && process.env.NOW_CLI_COLLECT_METRICS !== '0';

const metric = metrics(GA_TRACKING_ID, config.token);

export default function error(
  ...input: string[] | [{ slug: string; message: string }]
) {
  let messages = input;
  if (typeof input[0] === 'object') {
    const { slug, message } = input[0];
    messages = [message];
    if (slug) {
      messages.push(`> More details: https://err.sh/now-cli/${slug}`);
    }
  }

  if (shouldCollectMetrics) {
    metric.exception(messages.join('\n')).send();
  }

  return `${chalk.red('> Error!')} ${messages.join('\n')}`;
}
