import chalk from 'chalk';
import Client from '../../util/client';
import { ensureLink } from '../../util/ensure-link';
import getArgs from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import handleError from '../../util/handle-error';
import logo from '../../util/output/logo';
import { getPkgName } from '../../util/pkg-name';
import validatePaths from '../../util/validate-paths';
import connect from './connect';
import disconnect from './disconnect';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} git`)} <command>

  ${chalk.dim('Commands:')}

    connect [url]             Connect your Vercel Project to your Git repository or provide the remote URL to your Git repository
    disconnect                Disconnect the Git provider repository from your project

  ${chalk.dim('Options:')}

    -h, --help                Output usage information
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}   Login token
    -y, --yes                 Skip confirmation when connecting a Git provider

  ${chalk.dim('Examples:')}

  ${chalk.gray(
    '–'
  )} Connect your Vercel Project to your Git repository defined in your local .git config

    ${chalk.cyan(`$ ${getPkgName()} git connect`)}
  
  ${chalk.gray(
    '–'
  )} Connect your Vercel Project to a Git repository using the remote URL

    ${chalk.cyan(
      `$ ${getPkgName()} git connect https://github.com/user/repo.git`
    )}

  ${chalk.gray('–')} Disconnect the Git provider repository

    ${chalk.cyan(`$ ${getPkgName()} git disconnect`)}
`);
};

const COMMAND_CONFIG = {
  connect: ['connect'],
  disconnect: ['disconnect'],
};

export default async function main(client: Client) {
  let argv: any;
  let subcommand: string | string[];

  try {
    argv = getArgs(client.argv.slice(2), {
      '--yes': Boolean,
      '-y': '--yes',

      // deprecated
      '-c': '--yes',
      '--confirm': '--yes',
    });
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }

  argv._ = argv._.slice(1);
  subcommand = argv._[0];
  const args = argv._.slice(1);
  const confirm = Boolean(argv['--yes']);
  const { output } = client;

  let paths = [process.cwd()];
  const pathValidation = await validatePaths(client, paths);
  if (!pathValidation.valid) {
    return pathValidation.exitCode;
  }
  const { path } = pathValidation;

  const linkedProject = await ensureLink('git', client, path, confirm);
  if (typeof linkedProject === 'number') {
    return linkedProject;
  }

  const { org, project } = linkedProject;

  switch (subcommand) {
    case 'connect':
      return await connect(client, argv, args, project, org);
    case 'disconnect':
      return await disconnect(client, args, project, org);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      help();
      return 2;
  }
}
