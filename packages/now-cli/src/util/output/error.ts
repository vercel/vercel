import chalk from 'chalk';
import { metrics, shouldCollectMetrics } from '../metrics';
import { APIError } from '../errors-ts';

const metric = metrics();

export default function error(...input: string[] | [APIError]) {
  let messages = input;
  if (typeof input[0] === 'object') {
    const { slug, message, link } = input[0];
    messages = [message];
    if (slug) {
      messages.push(`> More details: https://err.sh/now/${slug}`);
    } else if (link) {
      messages.push(`> More details: ${link}`);
    }
  }

  if (shouldCollectMetrics) {
    metric.exception(messages.join('\n')).send();
  }

  return `${chalk.red('Error!')} ${messages.join('\n')}`;
}
