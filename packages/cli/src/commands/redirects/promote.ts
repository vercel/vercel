import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { promoteSubcommand } from './command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  validateRequiredArgs,
  confirmAction,
} from './shared';
import getRedirectVersions from '../../util/redirects/get-redirect-versions';
import updateRedirectVersion from '../../util/redirects/update-redirect-version';
import getRedirects from '../../util/redirects/get-redirects';
import stamp from '../../util/output/stamp';

export default async function promote(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, promoteSubcommand);
  if (typeof parsed === 'number') return parsed;

  const error = validateRequiredArgs(parsed.args, ['version-id']);
  if (error) {
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
    output.error(
      `Version with ID or name "${versionIdentifier}" not found. Run ${chalk.cyan(
        'vercel redirects list-versions'
      )} to see available versions.`
    );
    return 1;
  }

  if (version.isLive) {
    output.error(
      `Version ${chalk.bold(version.name || version.id)} is already live.`
    );
    return 1;
  }

  if (!version.isStaging) {
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
