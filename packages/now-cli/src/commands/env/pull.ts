// TODO: GET /v2/now/secrets/:secretid?decrypt=1
import chalk from 'chalk';
import { NowContext, ProjectEnvTarget } from '../../types';
import { Output } from '../../util/output';
import Client from '../../util/client';
import stamp from '../../util/output/stamp';
import getEnvVariables from '../../util/env/get-env-records';
import getDecryptedSecret from '../../util/env/get-decrypted-secret';
import { getLinkedProject } from '../../util/projects/link';
import cmd from '../../util/output/cmd';
import withSpinner from '../../util/with-spinner';
import { join } from 'path';
import { promises } from 'fs';
import { emoji, prependEmoji } from '../../util/emoji';
const { writeFile } = promises;

type Options = {
  '--debug': boolean;
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
    const { project } = link;
    if (args.length > 1) {
      output.error(
        `Invalid number of arguments. Usage: ${chalk.cyan(
          '`now env pull <file>`'
        )}`
      );
      return 1;
    }

    const [filename = '.env'] = args;
    output.print(
      `Downloading Development environment variables for project ${chalk.bold(
        project.name
      )}\n`
    );
    const pullStamp = stamp();

    const records = await withSpinner('Downloading', async () => {
      const dev = ProjectEnvTarget.Development;
      const envs = await getEnvVariables(output, client, project.id, dev);
      for (const env of envs) {
        env.value = await getDecryptedSecret(output, client, env.value);
      }
      return envs;
    });

    const quote = '"';
    const contents =
      records
        .map(
          ({ key, value }) =>
            `${key}=${quote}${escapeValue(value, quote)}${quote}`
        )
        .join('\n') + '\n';

    const fullPath = join(process.cwd(), filename);
    await writeFile(fullPath, contents, 'utf8');

    output.print(
      `${prependEmoji(
        `Updated file ${chalk.bold(filename)} ${chalk.gray(pullStamp())}`,
        emoji('success')
      )}\n`
    );
    return 0;
  }
}

function escapeValue(value: string, char: string) {
  return value.replace(new RegExp(`\\${char}`, 'g'), `\\${char}`);
}
