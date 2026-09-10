import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import type { Deployment } from '@vercel-internals/types';
import type Client from '../../util/client';

import { isDeploying } from '../../util/deploy/is-deploying';
import linkStyle from '../output/link';
import { prependEmoji, emoji } from '../../util/emoji';
import output from '../../output-manager';
import { withGlobalFlags } from '../agent-output';
import {
  suggestNextCommands,
  type SuggestedNextCommand,
} from '../suggest-next-commands';

/**
 * `deployStamp()` returns a string formatted like `[47s]` (gray-wrapped).
 * Strip the ANSI color codes and surrounding brackets to get a bare duration
 * for inline use like `✓ Ready in 47s`.
 */
function bareDuration(stamp: string): string {
  return stripAnsi(stamp).replace(/^\[|\]$/g, '');
}

/**
 * Prints (to `output`) warnings and errors, if any.
 */
export async function printDeploymentStatus(
  client: Client,
  {
    readyState,
    aliasError,
    indications,
    aliasWarning,
    url,
    target,
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
  noWait: boolean,
  guidanceMode: boolean,
  isInit?: boolean,
  gitConnectCommand?: string
): Promise<number> {
  indications = indications || [];

  let isStillBuilding = false;
  if (noWait) {
    if (isDeploying(readyState)) {
      isStillBuilding = true;
      const message = isInit
        ? 'Deployment is awaiting continuation…'
        : 'Note: Deployment is still processing…';
      output.print(prependEmoji(message, emoji('notice')) + '\n');
    }
  }

  if (!isStillBuilding && readyState !== 'READY') {
    output.error(
      `Your deployment failed. Please retry later. More: https://err.sh/vercel/deployment-error`
    );
    return 1;
  }

  // ✓ Ready in Xs — terminal state of the deploy flow, gutter glyph at col 0.
  // Skipped when --no-wait is set and the deployment hasn't reached READY yet
  // (we don't wait for it). Still prints if --no-wait happens to land on READY.
  if (!isStillBuilding && readyState === 'READY') {
    const duration = bareDuration(deployStamp());
    output.print(
      `\n${chalk.green('✓')} ${chalk.bold('Ready')} ${chalk.dim(`in ${duration}`)}\n`
    );
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

  if (gitConnectCommand || guidanceMode) {
    output.print('\n');
    const nextCommands: SuggestedNextCommand[] = [];
    if (gitConnectCommand) {
      nextCommands.push({
        description:
          'Automatically deploy changes on every push by connecting Git',
        command: gitConnectCommand,
      });
    }
    if (readyState === 'READY') {
      nextCommands.push({
        description: 'Check the deployment response',
        command: withGlobalFlags(client, `curl https://${url}`, {
          preserveProject: true,
        }),
      });
      nextCommands.push(
        {
          description: 'View build logs',
          command: withGlobalFlags(client, `inspect ${url} --logs`, {
            preserveProject: true,
          }),
        },
        {
          description: 'Create a new deployment from the same source',
          command: withGlobalFlags(client, `redeploy ${url}`, {
            preserveProject: true,
          }),
        }
      );
      if (target !== 'production') {
        nextCommands.push({
          description: 'Deploy the current project to production',
          command: withGlobalFlags(client, 'deploy --prod', {
            preserveProject: true,
          }),
        });
      }
    } else {
      nextCommands.push({
        description: 'Check deployment status',
        command: withGlobalFlags(client, `inspect ${url}`, {
          preserveProject: true,
        }),
      });
    }
    suggestNextCommands(nextCommands);
  }

  return 0;
}
