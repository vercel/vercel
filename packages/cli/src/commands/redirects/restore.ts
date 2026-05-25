import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import {
  outputActionRequired,
  outputAgentError,
  buildCommandWithYes,
} from '../../util/agent-output';
import {
  AGENT_STATUS,
  AGENT_REASON,
  AGENT_ACTION,
} from '../../util/agent-output-constants';
import { restoreSubcommand } from './command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  validateRequiredArgs,
  confirmAction,
  getArgsAfterRedirectsSubcommand,
  getRedirectGlobalFlagsOnly,
  getRedirectPromoteSuggestionFlags,
} from './shared';
import { getCommandNamePlain } from '../../util/pkg-name';
import getRedirectVersions from '../../util/redirects/get-redirect-versions';
import updateRedirectVersion from '../../util/redirects/update-redirect-version';
import getRedirects from '../../util/redirects/get-redirects';
import stamp from '../../util/output/stamp';

export default async function restore(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, restoreSubcommand);
  if (typeof parsed === 'number') return parsed;

  const error = validateRequiredArgs(parsed.args, ['version-id']);
  if (error) {
    if (client.nonInteractive) {
      const afterRestore = getArgsAfterRedirectsSubcommand(
        client.argv.slice(2),
        'restore'
      );
      const globalFlags = getRedirectGlobalFlagsOnly(afterRestore);
      const listVersionsCmd = getCommandNamePlain(
        `redirects list-versions ${globalFlags.join(' ')}`.trim()
      );
      const restoreFlagParts = getRedirectPromoteSuggestionFlags(afterRestore);
      const restoreCmd = getCommandNamePlain(
        `redirects restore <version-id> ${restoreFlagParts.join(' ')}`.trim()
      );
      outputActionRequired(
        client,
        {
          status: AGENT_STATUS.ACTION_REQUIRED,
          reason: AGENT_REASON.MISSING_ARGUMENTS,
          action: AGENT_ACTION.MISSING_ARGUMENTS,
          message: `${error} Run ${listVersionsCmd} to list version IDs and names, then ${restoreCmd} (replace <version-id> with a non-live, non-staging version).`,
          next: [
            {
              command: listVersionsCmd,
              when: 'To list redirect version IDs to restore',
            },
            {
              command: restoreCmd,
              when: 'To restore a previous version (substitute version-id)',
            },
          ],
        },
        1
      );
    }
    output.error(error);
    return 1;
  }

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  const [versionIdentifier] = parsed.args;

  output.spinner(`Fetching redirect versions for ${chalk.bold(project.name)}`);

  const { versions } = await getRedirectVersions(client, project.id, teamId);

  const version = versions.find(
    v => v.id === versionIdentifier || v.name === versionIdentifier
  );

  if (!version) {
    if (client.nonInteractive) {
      const afterRestore = getArgsAfterRedirectsSubcommand(
        client.argv.slice(2),
        'restore'
      );
      const globalFlags = getRedirectGlobalFlagsOnly(afterRestore);
      const listCmd = getCommandNamePlain(
        `redirects list-versions ${globalFlags.join(' ')}`.trim()
      );
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.VERSION_NOT_FOUND,
          message: `Version with ID or name "${versionIdentifier}" not found. Run ${listCmd} to see available versions.`,
          next: [{ command: listCmd }],
        },
        1
      );
    }
    output.error(
      `Version with ID or name "${versionIdentifier}" not found. Run ${chalk.cyan(
        'vercel redirects list-versions'
      )} to see available versions.`
    );
    return 1;
  }

  if (version.isLive) {
    if (client.nonInteractive) {
      const afterRestore = getArgsAfterRedirectsSubcommand(
        client.argv.slice(2),
        'restore'
      );
      const globalFlags = getRedirectGlobalFlagsOnly(afterRestore);
      const listCmd = getCommandNamePlain(
        `redirects list-versions ${globalFlags.join(' ')}`.trim()
      );
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.VERSION_ALREADY_LIVE,
          message: `Version ${version.name || version.id} is currently live. You cannot restore the live version. Run ${listCmd} to see previous versions you can restore.`,
          next: [{ command: listCmd }],
        },
        1
      );
    }
    output.error(
      `Version ${chalk.bold(
        version.name || version.id
      )} is currently live. You cannot restore the live version.\nRun ${chalk.cyan(
        'vercel redirects list-versions'
      )} to see previous versions you can restore.`
    );
    return 1;
  }

  if (version.isStaging) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.VERSION_IS_STAGING,
          message: `Version ${version.name || version.id} is staged. You can only restore previous (non-staging, non-live) versions.`,
        },
        1
      );
    }
    output.error(
      `Version ${chalk.bold(
        version.name || version.id
      )} is staged. You can only restore previous versions.`
    );
    return 1;
  }

  const versionName = version.name || version.id;

  output.spinner('Fetching changes');
  const { redirects: diffRedirects } = await getRedirects(client, project.id, {
    teamId,
    versionId: version.id,
    diff: true,
  });

  const changedRedirects = diffRedirects.filter(
    r => r.action === '+' || r.action === '-'
  );

  if (changedRedirects.length > 0) {
    output.print(`\n${chalk.bold('Changes to be restored:')}\n\n`);

    const displayRedirects = changedRedirects.slice(0, 20);
    for (const redirect of displayRedirects) {
      const status = redirect.statusCode || (redirect.permanent ? 308 : 307);
      const symbol =
        redirect.action === '+' ? chalk.green('+') : chalk.red('-');
      output.print(
        `  ${symbol} ${redirect.source} → ${redirect.destination} (${status})\n`
      );
    }

    if (changedRedirects.length > 20) {
      output.print(
        chalk.gray(`\n  ... and ${changedRedirects.length - 20} more changes\n`)
      );
    }

    output.print('\n');
  } else {
    output.print(
      `\n${chalk.gray('No changes detected from current production version.')}\n\n`
    );
  }

  if (client.nonInteractive && !parsed.flags['--yes']) {
    const cmd = buildCommandWithYes(client.argv);
    outputActionRequired(
      client,
      {
        status: AGENT_STATUS.ACTION_REQUIRED,
        reason: AGENT_REASON.CONFIRMATION_REQUIRED,
        action: AGENT_ACTION.CONFIRMATION_REQUIRED,
        message: `In non-interactive mode use --yes to confirm restore. Run: ${cmd}`,
        next: [{ command: cmd, when: 'to confirm restore to production' }],
      },
      1
    );
    return 1;
  }

  const confirmed = await confirmAction(
    client,
    parsed.flags['--yes'],
    `Restore version ${chalk.bold(versionName)}?`,
    `This will make it the live version for ${chalk.bold(project.name)}.`
  );

  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  const updateStamp = stamp();
  output.spinner(`Restoring version ${chalk.bold(versionName)}`);

  const { version: newVersion } = await updateRedirectVersion(
    client,
    project.id,
    version.id,
    'restore',
    teamId
  );

  output.log(
    `${chalk.cyan('✓')} Version ${chalk.bold(
      newVersion.name || newVersion.id
    )} restored to production ${chalk.gray(updateStamp())}`
  );

  return 0;
}
