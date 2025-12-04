import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { removeSubcommand } from './command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  validateRequiredArgs,
  confirmAction,
} from './shared';
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
    output.error(
      `Redirect with source "${source}" not found. Run ${chalk.cyan(
        'vercel redirects list'
      )} to see available redirects.`
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
      `There are other staged changes. Review them with ${chalk.cyan('vercel redirects list --staged')} before promoting to production.`
    );
  }

  return 0;
}
