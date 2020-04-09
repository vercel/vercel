import chalk from 'chalk';
import { NowContext, ProjectEnvTarget } from '../../types';
import { Output } from '../../util/output';
import promptBool from '../../util/prompt-bool';
import Client from '../../util/client';
import stamp from '../../util/output/stamp';
import getEnvVariables from '../../util/env/get-env-records';
import getDecryptedSecret from '../../util/env/get-decrypted-secret';
import { getLinkedProject } from '../../util/projects/link';
import cmd from '../../util/output/cmd';
import param from '../../util/output/param';
import withSpinner from '../../util/with-spinner';
import { join } from 'path';
import { promises, existsSync } from 'fs';
import { emoji, prependEmoji } from '../../util/emoji';
const { writeFile } = promises;

type Options = {
  '--debug': boolean;
  '--yes': boolean;
};

export default async function pull(
  ctx: NowContext,
  opts: Options,
  args: string[],
  output: Output
) {
  const {
    authConfig: { token },
    config,
  } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const debug = opts['--debug'];
  const client = new Client({ apiUrl, token, currentTeam, debug });
  const link = await getLinkedProject(output, client);

  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    output.print(
      `${chalk.red(
        'Error!'
      )} Your codebase isn’t linked to a project on ZEIT Now. Run ${cmd(
        'now'
      )} to link it.\n`
    );
    return 1;
  } else {
    if (args.length > 1) {
      output.error(
        `Invalid number of arguments. Usage: ${cmd('now env pull <file>')}`
      );
      return 1;
    }

    const { project } = link;
    const [filename = '.env'] = args;
    const fullPath = join(process.cwd(), filename);
    const exists = existsSync(fullPath);
    const skipConfirmation = opts['--yes'];

    if (
      exists &&
      !skipConfirmation &&
      !(await promptBool(
        output,
        `Found existing file ${param(filename)}. Do you want to overwrite?`
      ))
    ) {
      output.log('Aborted');
      return 0;
    }

    output.print(
      `Downloading Development environment variables for project ${chalk.bold(
        project.name
      )}\n`
    );
    const pullStamp = stamp();

    const records = await withSpinner('Downloading', async () => {
      const dev = ProjectEnvTarget.Development;
      const envs = await getEnvVariables(output, client, project.id, dev);
      const values = await Promise.all(
        envs.map(env => getDecryptedSecret(output, client, env.value))
      );
      const results: { key: string; value: string }[] = [];
      for (let i = 0; i < values.length; i++) {
        results.push({ key: envs[i].key, value: values[i] });
      }
      return results;
    });

    const contents =
      records
        .map(({ key, value }) => `${key}="${escapeValue(value)}"`)
        .join('\n') + '\n';

    await writeFile(fullPath, contents, 'utf8');

    output.print(
      `${prependEmoji(
        `${exists ? 'Updated' : 'Created'} file ${chalk.bold(
          filename
        )} ${chalk.gray(pullStamp())}`,
        emoji('success')
      )}\n`
    );
    return 0;
  }
}

function escapeValue(value: string) {
  return value
    .replace(new RegExp('\\"', 'g'), '\\"') // escape quotes
    .replace(new RegExp('\n', 'g'), '\\n') // combine newlines (unix) into one line
    .replace(new RegExp('\r', 'g'), '\\r'); // combine newlines (windows) into one line
}
