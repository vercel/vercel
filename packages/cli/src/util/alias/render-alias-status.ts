import chalk from 'chalk';

/**
 * Stylize the alias status label.
 * @param {AliasStatus} status - The status label
 * @returns {string}
 */
export default function renderAliasStatus(status: string): string {
  if (status === 'completed') {
    return chalk.green(status);
  }
  if (status === 'failed') {
    return chalk.red(status);
  }
  if (status === 'skipped') {
    return chalk.gray(status);
  }
  return chalk.yellow(status);
}
