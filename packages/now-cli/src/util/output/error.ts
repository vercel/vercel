import chalk from 'chalk';
import { metrics, shouldCollectMetrics } from '../metrics';

const metric = metrics();

export default function error(
  ...input: string[] | [{ slug: string; message: string }]
) {
  let messages = input;
  if (typeof input[0] === 'object') {
    const { slug, message } = input[0];
    messages = [message];
    if (slug) {
      messages.push(`> More details: https://err.sh/now/${slug}`);
    }
  }

  if (shouldCollectMetrics) {
    metric.exception(messages.join('\n')).send();
  }

  return `${chalk.red('Error!')} ${messages.join('\n')}`;
}
