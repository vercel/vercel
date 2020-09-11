import chalk from 'chalk';
import { metrics, shouldCollectMetrics } from '../metrics';
import { APIError } from '../errors-ts';
import renderLink from './link';

const metric = metrics();

export default function error(...input: string[] | [APIError]) {
  let messages = input;
  if (typeof input[0] === 'object') {
    const { slug, message, link, action = 'Learn More' } = input[0];
    messages = [message];
    const details = slug ? `https://err.sh/vercel/${slug}` : link;
    if (details) {
      messages.push(`${chalk.bold(action)}: ${renderLink(details)}`);
    }
  }

  if (shouldCollectMetrics) {
    metric.exception(messages.join('\n')).send();
  }

  return `${chalk.red('Error!')} ${messages.join('\n')}`;
}
