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
import { removeSubcommand } from './command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  validateRequiredArgs,
  confirmAction,
  buildRedirectsSuggestionFlags,
  getArgsAfterRedirectsSubcommand,
  getRedirectGlobalFlagsOnly,
  getRedirectPromoteSuggestionFlags,
} from './shared';
import { getCommandNamePlain } from '../../util/pkg-name';
import deleteRedirects from '../../util/redirects/delete-redirects';
import getRedirects from '../../util/redirects/get-redirects';
import getRedirectVersions from '../../util/redirects/get-redirect-versions';
import updateRedirectVersion from '../../util/redirects/update-redirect-version';
import stamp from '../../util/output/stamp';

export default async function remove(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, removeSubcommand);
  if (typeof parsed === 'number') return parsed;

  const error = validateRequiredArgs(parsed.args, ['source']);
  if (error) {
    if (client.nonInteractive) {
      const flagParts = buildRedirectsSuggestionFlags(
        client.argv.slice(2),
        'remove'
      );
      const cmd = getCommandNamePlain(
        `redirects remove <source> ${flagParts.join(' ')}`.trim()
      );
      outputActionRequired(
        client,
        {
          status: AGENT_STATUS.ACTION_REQUIRED,
          reason: AGENT_REASON.MISSING_ARGUMENTS,
          action: AGENT_ACTION.MISSING_ARGUMENTS,
          message: `${error} Run: ${cmd}`,
          next: [{ command: cmd, when: 'to remove a redirect' }],
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

  const { versions } = await getRedirectVersions(client, project.id, teamId);
  const existingStagingVersion = versions.find(v => v.isStaging);

  const [source] = parsed.args;

  output.spinner('Fetching redirect information');
  const { redirects } = await getRedirects(client, project.id, { teamId });
  const redirectToRemove = redirects.find(r => r.source === source);

  if (!redirectToRemove) {
    if (client.nonInteractive) {
      const afterRemove = getArgsAfterRedirectsSubcommand(
        client.argv.slice(2),
        'remove'
      );
      const globalFlags = getRedirectGlobalFlagsOnly(afterRemove);
      const listCmd = getCommandNamePlain(
        `redirects list ${globalFlags.join(' ')}`.trim()
      );
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.REDIRECT_NOT_FOUND,
          message: `Redirect with source "${source}" not found. Run ${listCmd} to see available redirects.`,
          next: [{ command: listCmd }],
        },
        1
      );
    }
    output.error(
      `Redirect with source "${source}" not found. Run ${chalk.cyan(
        'vercel redirects list'
      )} to see available redirects.`
    );
    return 1;
  }

  if (client.nonInteractive && !parsed.flags['--yes']) {
    const cmd = buildCommandWithYes(client.argv);
    outputActionRequired(
      client,
      {
        status: AGENT_STATUS.ACTION_REQUIRED,
        reason: AGENT_REASON.CONFIRMATION_REQUIRED,
        action: AGENT_ACTION.CONFIRMATION_REQUIRED,
        message: `In non-interactive mode use --yes to confirm removal. Run: ${cmd}`,
        next: [{ command: cmd, when: 'to confirm removal' }],
      },
      1
    );
    return 1;
  }

  output.print(`\n  ${chalk.bold('Removing redirect:')}\n`);
  output.print(
    `    ${chalk.cyan(redirectToRemove.source)} → ${chalk.cyan(redirectToRemove.destination)}\n`
  );
  const status =
    redirectToRemove.statusCode || (redirectToRemove.permanent ? 308 : 307);
  output.print(`    Status: ${status}\n\n`);

  const confirmed = await confirmAction(
    client,
    parsed.flags['--yes'],
    `Remove this redirect?`,
    `This will create a new staging version without this redirect.`
  );

  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  const removeStamp = stamp();
  output.spinner(`Removing redirect for ${chalk.bold(source)}`);

  const { alias, version } = await deleteRedirects(
    client,
    project.id,
    [source],
    teamId
  );

  if (client.nonInteractive) {
    output.stopSpinner();
    const testUrl = alias
      ? source.startsWith('/')
        ? `https://${alias}${source}`
        : `https://${alias}`
      : undefined;
    const afterRemove = getArgsAfterRedirectsSubcommand(
      client.argv.slice(2),
      'remove'
    );
    const promoteFlagParts = getRedirectPromoteSuggestionFlags(afterRemove);
    const promoteCmd = getCommandNamePlain(
      `redirects promote ${version.id} ${promoteFlagParts.join(' ')}`.trim()
    );
    const jsonOutput: Record<string, unknown> = {
      status: AGENT_STATUS.OK,
      removed: { source },
      version: { id: version.id, name: version.name || version.id },
      ...(alias && { alias, testUrl }),
      ...(!existingStagingVersion && {
        next: [
          {
            command: promoteCmd,
            when: 'To promote this staging version to production',
          },
        ],
      }),
      ...(existingStagingVersion && {
        hint: `Review staged changes with ${getCommandNamePlain('redirects list --staging')} before promoting.`,
      }),
    };
    client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
    return 0;
  }

  output.log(
    `${chalk.cyan('✓')} Redirect removed ${chalk.gray(removeStamp())}`
  );

  if (alias) {
    const testUrl = source.startsWith('/')
      ? `https://${alias}${source}`
      : `https://${alias}`;
    output.print(
      `\n  ${chalk.bold('Test your changes:')} ${chalk.cyan(testUrl)}\n`
    );
    output.print(
      `  This URL should no longer redirect to the above destination.\n`
    );
  }

  const versionName = version.name || version.id;
  output.print(`  ${chalk.bold('New staging version:')} ${versionName}\n\n`);

  if (!existingStagingVersion) {
    const shouldPromote = await client.input.confirm(
      'This is the only staged change. Do you want to promote it to production now?',
      false
    );

    if (shouldPromote) {
      const promoteStamp = stamp();
      output.spinner('Promoting to production');

      await updateRedirectVersion(
        client,
        project.id,
        version.id,
        'promote',
        teamId
      );

      output.log(
        `${chalk.cyan('✓')} Version promoted to production ${chalk.gray(promoteStamp())}`
      );
    }
  } else {
    output.warn(
      `There are other staged changes. Review them with ${chalk.cyan('vercel redirects list --staging')} before promoting to production.`
    );
  }

  return 0;
}
