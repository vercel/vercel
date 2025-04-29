import pc from 'picocolors';

/**
 * Stylize the alias status label.
 * @param {AliasStatus} status - The status label
 * @returns {string}
 */
export default function renderAliasStatus(status: string): string {
  if (status === 'completed') {
    return pc.green(status);
  }
  if (status === 'failed') {
    return pc.red(status);
  }
  if (status === 'skipped') {
    return pc.gray(status);
  }
  return pc.yellow(status);
}
