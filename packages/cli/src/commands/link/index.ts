import chalk from 'chalk';
import Client from '../../util/client';
import getArgs from '../../util/get-args';
import logo from '../../util/output/logo';
import cmd from '../../util/output/cmd';
import { getPkgName } from '../../util/pkg-name';
import { ensureLink } from '../../util/link/ensure-link';
import { ensureRepoLink } from '../../util/link/repo';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} link`)} [options]

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -r, --repo                     Link multiple projects based on Git repository (alpha)
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.vercel`'} directory
    -d, --debug                    Debug mode [off]
    --no-color                     No color mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token
    -p ${chalk.bold.underline('NAME')}, --project=${chalk.bold.underline(
    'NAME'
  )}        Project name
    -y, --yes                      Skip questions when setting up new project using default scope and settings

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Link current directory to a Vercel Project

      ${chalk.cyan(`$ ${getPkgName()} link`)}

  ${chalk.gray(
    '–'
  )} Link current directory with default options and skip questions

      ${chalk.cyan(`$ ${getPkgName()} link --yes`)}

  ${chalk.gray('–')} Link a specific directory to a Vercel Project

      ${chalk.cyan(`$ ${getPkgName()} link --cwd /path/to/project`)}

  ${chalk.gray('–')} ${chalk.yellow(
    '(alpha)'
  )} Link to the current Git repository, allowing for multiple
    Vercel Projects to be linked simultaneously (useful for monorepos)

      ${chalk.cyan(`$ ${getPkgName()} link --repo`)}
`);
};

export default async function main(client: Client) {
  const argv = getArgs(client.argv.slice(2), {
    '--yes': Boolean,
    '-y': '--yes',
    '--project': String,
    '-p': '--project',
    '--repo': Boolean,
    '-r': '--repo',

    // deprecated
    '--confirm': Boolean,
    '-c': '--confirm',
  });

  if (argv['--help']) {
    help();
    return 2;
  }

  if ('--confirm' in argv) {
    client.output.warn('`--confirm` is deprecated, please use `--yes` instead');
    argv['--yes'] = argv['--confirm'];
  }

  const yes = !!argv['--yes'];

  let cwd = argv._[1];
  if (cwd) {
    client.output.warn(
      `The ${cmd('vc link <directory>')} syntax is deprecated, please use ${cmd(
        `vc link --cwd ${cwd}`
      )} instead`
    );
  } else {
    cwd = client.cwd;
  }

  if (argv['--repo']) {
    client.output.warn(
      `The ${cmd('--repo')} flag is in alpha, please report issues`
    );
    await ensureRepoLink(client, cwd, { yes, overwrite: true });
  } else {
    const link = await ensureLink('link', client, cwd, {
      autoConfirm: yes,
      forceDelete: true,
      projectName: argv['--project'],
      successEmoji: 'success',
    });

    if (typeof link === 'number') {
      return link;
    }
  }

  return 0;
}
