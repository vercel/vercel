import chalk from 'chalk';
import title from 'title';
import output from '../../output-manager';

// Builds a string with an appropriately coloured indicator, plus a
// `[SANDBOX]` annotation for sandbox marketplace resources.
export function resourceStatus(status: string, isSandbox = false) {
  const CIRCLE = '● ';
  const statusTitleCase = title(status);
  const sandboxTag = isSandbox ? ` ${chalk.yellow('[SANDBOX]')}` : '';
  switch (status) {
    case 'initializing':
      return chalk.yellow(CIRCLE) + statusTitleCase + sandboxTag;
    case 'error':
      return chalk.red(CIRCLE) + statusTitleCase + sandboxTag;
    case 'available':
      return chalk.green(CIRCLE) + statusTitleCase + sandboxTag;
    case 'suspended':
      return chalk.white(CIRCLE) + statusTitleCase + sandboxTag;
    case 'limits-exceeded-suspended':
      return `${chalk.white(CIRCLE)}Limits exceeded${sandboxTag}`;
    default:
      return chalk.gray(statusTitleCase) + sandboxTag;
  }
}

// Builds a deep link to the vercel dashboard resource page
export function resourceLink(
  orgSlug: string,
  resource: { id: string; name?: string }
): string | undefined {
  if (!resource.name) {
    return;
  }

  const projectUrl = `https://vercel.com/${orgSlug}/~`;
  return output.link(
    resource.name,
    `${projectUrl}/stores/integration/${resource.id}`,
    { fallback: () => resource.name ?? '–', color: false }
  );
}
