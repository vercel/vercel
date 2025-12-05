import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { addSubcommand } from './command';
import { parseSubcommandArgs, ensureProjectLink, isValidUrl } from './shared';
import putRedirects from '../../util/redirects/put-redirects';
import updateRedirectVersion from '../../util/redirects/update-redirect-version';
import getRedirectVersions from '../../util/redirects/get-redirect-versions';
import stamp from '../../util/output/stamp';

/**
 * Adds a new redirect to the current project and stages the changes for production.
 */
export default async function add(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, addSubcommand);
  if (typeof parsed === 'number') return parsed;

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  const { versions } = await getRedirectVersions(client, project.id, teamId);
  const existingStagingVersion = versions.find(v => v.isStaging);

  output.log('Add a new redirect\n');

  const source = await client.input.text({
    message: 'What is the source URL?',
    validate: val => {
      if (!val) {
        return 'Source URL cannot be empty';
      }
      if (!isValidUrl(val)) {
        return 'Must be a relative path (starting with /) or an absolute URL';
      }
      return true;
    },
  });

  const destination = await client.input.text({
    message: 'What is the destination URL?',
    validate: val => {
      if (!val) {
        return 'Destination URL cannot be empty';
      }
      if (!isValidUrl(val)) {
        return 'Must be a relative path (starting with /) or an absolute URL';
      }
      return true;
    },
  });

  const statusCode = await client.input.select({
    message: 'Select the status code:',
    choices: [
      {
        name: '301 - Moved Permanently (cached by browsers)',
        value: 301,
      },
      {
        name: '302 - Found (temporary redirect, not cached)',
        value: 302,
      },
      {
        name: '307 - Temporary Redirect (preserves request method)',
        value: 307,
      },
      {
        name: '308 - Permanent Redirect (preserves request method)',
        value: 308,
      },
    ],
  });

  const caseSensitive = await client.input.confirm(
    'Should the redirect be case sensitive?',
    false
  );

  const provideName = await client.input.confirm(
    'Do you want to provide a name for this version?',
    false
  );

  let versionName: string | undefined;
  if (provideName) {
    versionName = await client.input.text({
      message: 'Version name (max 256 characters):',
      validate: val => {
        if (val && val.length > 256) {
          return 'Name must be 256 characters or less';
        }
        return true;
      },
    });
    if (!versionName) {
      versionName = undefined;
    }
  }

  const addStamp = stamp();
  output.spinner('Adding redirect');

  const { alias, version } = await putRedirects(
    client,
    project.id,
    [
      {
        source,
        destination,
        statusCode,
        caseSensitive,
      },
    ],
    teamId,
    versionName
  );

  output.log(`${chalk.cyan('✓')} Redirect added ${chalk.gray(addStamp())}`);

  output.print(`\n  ${chalk.bold('Redirect:')}\n`);
  output.print(`    ${chalk.cyan(source)} → ${chalk.cyan(destination)}\n`);
  output.print(`    Status: ${statusCode}\n`);
  output.print(`    Case sensitive: ${caseSensitive ? 'Yes' : 'No'}\n`);

  if (alias) {
    const testUrl = source.startsWith('/')
      ? `https://${alias}${source}`
      : `https://${alias}`;
    output.print(
      `\n  ${chalk.bold('Test your changes:')} ${chalk.cyan(testUrl)}\n`
    );
  }

  const newVersionName = version.name || version.id;
  output.print(`  ${chalk.bold('New staging version:')} ${newVersionName}\n\n`);

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
      `There are other staged changes. Please review all changes with ${chalk.cyan('vercel redirects list --staged')} before promoting to production.`
    );
  }

  return 0;
}
