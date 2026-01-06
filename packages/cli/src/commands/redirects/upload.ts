import { readFileSync } from 'fs';
import { basename } from 'path';
import chalk from 'chalk';
import FormData from 'form-data';
import type Client from '../../util/client';
import output from '../../output-manager';
import { uploadSubcommand } from './command';
import { parseSubcommandArgs, ensureProjectLink } from './shared';
import stamp from '../../util/output/stamp';
import getRedirectVersions from '../../util/redirects/get-redirect-versions';
import updateRedirectVersion from '../../util/redirects/update-redirect-version';
import getRedirects from '../../util/redirects/get-redirects';
import formatTable from '../../util/format-table';
import {
  validateUploadFile,
  validateRedirectsArray,
  validateCSVStructure,
  validateVersionName,
} from './validate-redirects';

interface UploadResult {
  alias?: string;
  version: {
    id: string;
    name?: string;
    isStaging?: boolean;
    isLive?: boolean;
    redirectCount?: number;
  };
}

/**
 * Uploads bulk redirects from a CSV or JSON file to the current project.
 */
export default async function upload(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, uploadSubcommand);
  if (typeof parsed === 'number') return parsed;

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  const { args, flags } = parsed;
  const skipPrompts = flags['--yes'];
  const overwrite = flags['--overwrite'] || false;

  const filePath = args[0];

  if (!filePath) {
    output.error('File path is required. Use: vercel redirects upload <file>');
    return 1;
  }

  const fileValidation = validateUploadFile(filePath);
  if (!fileValidation.valid) {
    output.error(fileValidation.error!);
    return 1;
  }

  const { versions } = await getRedirectVersions(client, project.id, teamId);
  const existingStagingVersion = versions.find(v => v.isStaging);

  if (!skipPrompts) {
    const fileName = basename(filePath);
    const fileType = filePath.endsWith('.csv') ? 'CSV' : 'JSON';
    const message = overwrite
      ? `Upload ${fileType} file "${fileName}" and replace all existing redirects?`
      : `Upload ${fileType} file "${fileName}"?`;

    const confirmed = await client.input.confirm(message, true);
    if (!confirmed) {
      output.log('Upload cancelled');
      return 0;
    }
  }

  let versionName: string | undefined;
  if (!skipPrompts) {
    const provideName = await client.input.confirm(
      'Do you want to provide a name for this version?',
      false
    );

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
      const { valid, error } = validateVersionName(versionName);
      if (!valid) {
        output.error(error!);
        return 1;
      }
    }
  }

  const uploadStamp = stamp();
  output.spinner('Uploading redirects');

  try {
    let result: UploadResult;
    const url = '/v1/bulk-redirects';

    if (filePath.endsWith('.csv')) {
      const csvContent = readFileSync(filePath);
      const fileName = basename(filePath);

      const csvValidation = validateCSVStructure(csvContent.toString());
      if (!csvValidation.valid) {
        output.error(`Invalid CSV: ${csvValidation.error}`);
        return 1;
      }

      const form = new FormData();
      form.append('teamId', teamId || org.id);
      form.append('projectId', project.id);
      form.append('overwrite', String(overwrite));

      if (versionName) {
        form.append('name', versionName);
      }

      form.append('bulkRedirectsFile', csvContent, {
        filename: fileName,
        contentType: 'text/csv',
      });

      result = await client.fetch(url, {
        method: 'PUT',
        headers: form.getHeaders(),
        body: form,
      });
    } else {
      const content = readFileSync(filePath, 'utf8');
      let redirects;

      try {
        redirects = JSON.parse(content);
      } catch (err) {
        output.error('Invalid JSON file format');
        return 1;
      }

      const redirectsValidation = validateRedirectsArray(redirects);
      if (!redirectsValidation.valid) {
        output.error(redirectsValidation.error!);
        return 1;
      }

      const body: Record<string, any> = {
        projectId: project.id,
        redirects,
        overwrite,
      };

      if (teamId) {
        body.teamId = teamId;
      }

      if (versionName) {
        body.versionName = versionName;
      }

      result = await client.fetch(url, {
        method: 'PUT',
        body,
      });
    }

    output.log(
      `${chalk.cyan('✓')} Redirects uploaded ${chalk.gray(uploadStamp())}`
    );

    output.spinner('Fetching diff');

    // Fetch the redirects with diff=only to show what was added
    const { redirects } = await getRedirects(client, project.id, {
      teamId,
      versionId: result.version.id,
      diff: 'only',
    });

    const redirectCount = redirects.length;
    output.print(`\n  ${chalk.bold('Summary:')}\n`);
    output.print(
      `    Uploaded ${redirectCount} redirect${redirectCount === 1 ? '' : 's'}\n`
    );

    if (redirectCount > 0) {
      const added = redirects.filter(r => r.action === '+');
      const deleted = redirects.filter(r => r.action === '-');
      const edited = redirects.filter(r => r.action === '~');

      output.print(`\n  ${chalk.bold('Changes:')}\n`);

      if (added.length > 0) {
        output.print(`    ${chalk.green(`Added: ${added.length}`)}\n`);
      }
      if (deleted.length > 0) {
        output.print(`    ${chalk.red(`Deleted: ${deleted.length}`)}\n`);
      }
      if (edited.length > 0) {
        output.print(`    ${chalk.yellow(`Modified: ${edited.length}`)}\n`);
      }

      output.print(`\n  ${chalk.bold('Redirect changes:')}\n`);

      const displayRedirects = redirects.slice(0, 100);
      const rows: string[][] = displayRedirects.map(redirect => {
        const status = redirect.statusCode || (redirect.permanent ? 308 : 307);
        const action = redirect.action || '+';

        let colorFn: (str: string) => string;
        let actionSymbol: string;

        switch (action) {
          case '+':
            colorFn = chalk.green;
            actionSymbol = '+';
            break;
          case '-':
            colorFn = chalk.red;
            actionSymbol = '-';
            break;
          case '~':
            colorFn = chalk.yellow;
            actionSymbol = '~';
            break;
          default:
            colorFn = (s: string) => s;
            actionSymbol = ' ';
        }

        return [
          colorFn(`${actionSymbol} ${redirect.source}`),
          colorFn(redirect.destination),
          colorFn(status.toString()),
        ];
      });

      output.print(
        formatTable(
          ['Source', 'Destination', 'Status'],
          ['l', 'l', 'l'],
          [{ rows }]
        )
      );

      if (redirectCount > 100) {
        output.print(
          `\n  ${chalk.gray(`... and ${redirectCount - 100} more redirect${redirectCount - 100 === 1 ? '' : 's'}`)}\n`
        );
      }
    }

    if (result.alias) {
      const testUrl = `https://${result.alias}`;
      output.print(
        `\n  ${chalk.bold('Test your changes:')} ${chalk.cyan(testUrl)}\n`
      );
    }

    const newVersionName = result.version.name || result.version.id;
    output.print(
      `  ${chalk.bold('New staging version:')} ${newVersionName}\n\n`
    );

    if (existingStagingVersion) {
      output.warn(
        `There are other staged changes. Please review all changes with ${chalk.cyan('vercel redirects list --staging')} before promoting to production.`
      );
    } else if (!skipPrompts) {
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
          result.version.id,
          'promote',
          teamId
        );

        output.log(
          `${chalk.cyan('✓')} Version promoted to production ${chalk.gray(promoteStamp())}`
        );
      }
    }

    return 0;
  } catch (error: any) {
    output.error(`Failed to upload redirects: ${error.message}`);
    return 1;
  }
}
