import chalk from 'chalk';
import type Client from '../client';
import type { Deployment } from '@vercel-internals/types';
import { getPreferredPreviewURL } from '../../util/deploy/get-preferred-preview-url';
import { isDeploying } from '../../util/deploy/is-deploying';
import linkStyle from '../output/link';
import { prependEmoji, emoji } from '../../util/emoji';

export async function printDeploymentStatus(
  client: Client,
  {
    readyState,
    alias: aliasList,
    aliasError,
    target,
    indications,
    url: deploymentUrl,
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
  const { output } = client;

  indications = indications || [];
  const isProdDeployment = target === 'production';

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
  } else {
    // print preview/production url
    let previewUrl: string;
    // if `noWait` is true, then use the deployment url, not an alias
    if (!noWait && Array.isArray(aliasList) && aliasList.length > 0) {
      const previewUrlInfo = await getPreferredPreviewURL(client, aliasList);
      if (previewUrlInfo) {
        previewUrl = previewUrlInfo.previewUrl;
      } else {
        previewUrl = `https://${deploymentUrl}`;
      }
    } else {
      // fallback to deployment url
      previewUrl = `https://${deploymentUrl}`;
    }

    output.print(
      prependEmoji(
        `${isProdDeployment ? 'Production' : 'Preview'}: ${chalk.bold(
          previewUrl
        )} ${deployStamp()}`,
        emoji('success')
      ) + `\n`
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
  for (let indication of indications) {
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
