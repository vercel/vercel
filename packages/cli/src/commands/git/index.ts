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

    connect                          Connect your Git config "origin" remote as a Git provider to your project
    disconnect                       Disconnect the Git provider repository from your project

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Connect a Git provider repository

    ${chalk.cyan(`$ ${getPkgName()} git connect`)}

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
      '--confirm': Boolean,
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
  const confirm = Boolean(argv['--confirm']);
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
