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
import { promoteSubcommand } from './command';
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

export default async function promote(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, promoteSubcommand);
  if (typeof parsed === 'number') return parsed;

  const error = validateRequiredArgs(parsed.args, ['version-id']);
  if (error) {
    if (client.nonInteractive) {
      const afterPromote = getArgsAfterRedirectsSubcommand(
        client.argv.slice(2),
        'promote'
      );
      const listVersionsCmd = getCommandNamePlain(
        `redirects list-versions ${getRedirectGlobalFlagsOnly(afterPromote).join(' ')}`.trim()
      );
      const promoteFlagParts = getRedirectPromoteSuggestionFlags(afterPromote);
      const promoteCmd = getCommandNamePlain(
        `redirects promote <version-id> ${promoteFlagParts.join(' ')}`.trim()
      );
      outputActionRequired(
        client,
        {
          status: AGENT_STATUS.ACTION_REQUIRED,
          reason: AGENT_REASON.MISSING_ARGUMENTS,
          action: AGENT_ACTION.MISSING_ARGUMENTS,
          message: `${error} Run ${listVersionsCmd} to list version IDs and names, then ${promoteCmd} (replace <version-id> with a staging version to promote).`,
          next: [
            { command: listVersionsCmd, when: 'To list redirect version IDs' },
            {
              command: promoteCmd,
              when: 'To promote a staging version (substitute version-id)',
            },
          ],
        },
        1
      );
      return 1;
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
      const afterPromote = getArgsAfterRedirectsSubcommand(
        client.argv.slice(2),
        'promote'
      );
      const listVersionsCmd = getCommandNamePlain(
        `redirects list-versions ${getRedirectGlobalFlagsOnly(afterPromote).join(' ')}`.trim()
      );
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.NOT_FOUND,
          message: `Version with ID or name "${versionIdentifier}" not found.`,
          next: [
            {
              command: listVersionsCmd,
              when: 'To see available redirect versions (IDs and names)',
            },
          ],
        },
        1
      );
      return 1;
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
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: `Version ${version.name || version.id} is already live. Nothing to promote.`,
        },
        1
      );
      return 1;
    }
    output.error(
      `Version ${chalk.bold(version.name || version.id)} is already live.`
    );
    return 1;
  }

  if (!version.isStaging) {
    if (client.nonInteractive) {
      const afterPromote = getArgsAfterRedirectsSubcommand(
        client.argv.slice(2),
        'promote'
      );
      const listVersionsCmd = getCommandNamePlain(
        `redirects list-versions ${getRedirectGlobalFlagsOnly(afterPromote).join(' ')}`.trim()
      );
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: `Version ${version.name || version.id} is not staged. Only staging versions can be promoted to production.`,
          next: [
            {
              command: listVersionsCmd,
              when: 'To see which version is currently staged',
            },
          ],
        },
        1
      );
      return 1;
    }
    output.error(
      `Version ${chalk.bold(
        version.name || version.id
      )} is not staged. Only staging versions can be promoted to production.\nRun ${chalk.cyan(
        'vercel redirects list-versions'
      )} to see which version is currently staged.`
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
    output.print(`\n${chalk.bold('Changes to be promoted:')}\n\n`);

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
        message: `In non-interactive mode use --yes to confirm promote. Run: ${cmd}`,
        next: [{ command: cmd, when: 'to confirm promote to production' }],
      },
      1
    );
    return 1;
  }

  const confirmed = await confirmAction(
    client,
    parsed.flags['--yes'],
    `Promote version ${chalk.bold(versionName)} to production?`,
    `This will make it the live version for ${chalk.bold(project.name)}.`
  );

  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  const updateStamp = stamp();
  output.spinner(`Promoting version ${chalk.bold(versionName)} to production`);

  const { version: newVersion } = await updateRedirectVersion(
    client,
    project.id,
    version.id,
    'promote',
    teamId
  );

  output.log(
    `${chalk.cyan('✓')} Version ${chalk.bold(
      newVersion.name || newVersion.id
    )} promoted to production ${chalk.gray(updateStamp())}`
  );

  return 0;
}
