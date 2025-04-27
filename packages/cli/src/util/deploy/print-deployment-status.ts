import chalk from 'chalk';
import type { Deployment } from '@vercel-internals/types';

import { isDeploying } from '../../util/deploy/is-deploying';
import linkStyle from '../output/link';
import { prependEmoji, emoji } from '../../util/emoji';
import output from '../../output-manager';

/**
 * Prints (to `output`) warnings and errors, if any.
 */
export async function printDeploymentStatus(
  {
    readyState,
    aliasError,
    indications,
    aliasWarning,
  }: {
    readyState: Deployment['readyState'];
    alias: string[];
    aliasError: Error;
    target: string;
    indications: any;
    url: string;
    aliasWarning?: {
      code: string;
      message: string;
      link?: string;
      action?: string;
    };
  },
  deployStamp: () => string,
  noWait: boolean
): Promise<number> {
  indications = indications || [];

  let isStillBuilding = false;
  if (noWait) {
    if (isDeploying(readyState)) {
      isStillBuilding = true;
      output.print(
        prependEmoji(
          'Note: Deployment is still processing...',
          emoji('notice')
        ) + '\n'
      );
    }
  }

  if (!isStillBuilding && readyState !== 'READY') {
    output.error(
      `Your deployment failed. Please retry later. More: https://err.sh/vercel/deployment-error`
    );
    return 1;
  }

  if (aliasError) {
    output.warn(
      `Failed to assign aliases${
        aliasError.message ? `: ${aliasError.message}` : ''
      }`
    );
  }

  if (aliasWarning?.message) {
    indications.push({
      type: 'warning',
      payload: aliasWarning.message,
      link: aliasWarning.link,
      action: aliasWarning.action,
    });
  }

  const newline = '\n';
  for (const indication of indications) {
    const message =
      prependEmoji(chalk.dim(indication.payload), emoji(indication.type)) +
      newline;
    let link = '';
    if (indication.link)
      link =
        chalk.dim(
          `${indication.action || 'Learn More'}: ${linkStyle(indication.link)}`
        ) + newline;
    output.print(message + link);
  }

  return 0;
}
