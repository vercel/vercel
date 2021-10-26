import chalk from 'chalk';
import { join } from 'path';
import Client from '../util/client';
import { emoji, prependEmoji } from '../util/emoji';
import getArgs from '../util/get-args';
import handleError from '../util/handle-error';
import setupAndLink from '../util/link/setup-and-link';
import logo from '../util/output/logo';
import stamp from '../util/output/stamp';
import { getPkgName } from '../util/pkg-name';
import {
  getLinkedProject,
  VERCEL_DIR,
  VERCEL_DIR_PROJECT,
} from '../util/projects/link';
import { writeProjectSettings } from '../util/projects/project-settings';
import pull from './env/pull';

const help = () => {
  return console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} pull`)} [path]

 ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.vercel`'} directory
    -d, --debug                    Debug mode [off]
    --env [filename]               The file to write Development Environment Variables to [.env]
    -y, --yes                      Skip the confirmation prompt

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Pull the latest Project Settings from the cloud

    ${chalk.cyan(`$ ${getPkgName()} pull`)}
    ${chalk.cyan(`$ ${getPkgName()} pull ./path-to-project`)}
    ${chalk.cyan(`$ ${getPkgName()} pull --env .env.local`)}
    ${chalk.cyan(`$ ${getPkgName()} pull ./path-to-project --env .env.local`)}
`);
};
export default async function main(client: Client) {
  let argv;
  try {
    argv = getArgs(client.argv.slice(2), {
      '--yes': Boolean,
      '--env': String,
      '--debug': Boolean,
      '-d': '--debug',
      '-y': '--yes',
    });
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }

  const cwd = argv._[1] || process.cwd();
  const yes = argv['--yes'];
  const env = argv['--env'] ?? '.env';
  const settingsStamp = stamp();
  let link = await getLinkedProject(client, cwd);
  if (link.status === 'not_linked') {
    link = await setupAndLink(client, cwd, {
      autoConfirm: yes,
      successEmoji: 'link',
      setupMsg: 'Set up',
    });

    if (link.status === 'not_linked') {
      // User aborted project linking questions
      return 0;
    }
  }

  if (link.status === 'error') {
    return link.exitCode;
  }

  const { project, org } = link;

  const result = await pull(
    client,
    project,
    argv,
    [join(cwd, env)],
    client.output
  );
  if (result !== 0) {
    // an error happened
    return result;
  }

  await writeProjectSettings(cwd, project, org);

  client.output.print(
    `${prependEmoji(
      `Downloaded project settings to ${chalk.bold(
        join(VERCEL_DIR, VERCEL_DIR_PROJECT)
      )} ${chalk.gray(settingsStamp())}`,
      emoji('success')
    )}\n`
  );

  return 0;
}
