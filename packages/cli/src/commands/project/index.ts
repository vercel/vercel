import chalk from 'chalk';
import Client from '../../util/client';
import { ensureLink } from '../../util/ensure-link';
import getArgs from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getScope from '../../util/get-scope';
import handleError from '../../util/handle-error';
import logo from '../../util/output/logo';
import { getPkgName } from '../../util/pkg-name';
import { getLinkedProject } from '../../util/projects/link';
import validatePaths from '../../util/validate-paths';
import add from './add';
import connect from './connect';
import list from './list';
import rm from './rm';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} projects`)} [options] <command>

  ${chalk.dim('Commands:')}

    ls                               Show all projects in the selected team/user
    connect                          Connect a Git provider to your project
    add      [name]                  Add a new project
    rm       [name]                  Remove a project

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token
    -S, --scope                    Set a custom scope
    -N, --next                     Show next page of results

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Add a new project

    ${chalk.cyan(`$ ${getPkgName()} projects add my-project`)}

  ${chalk.gray('–')} Paginate projects, where ${chalk.dim(
    '`1584722256178`'
  )} is the time in milliseconds since the UNIX epoch.

    ${chalk.cyan(`$ ${getPkgName()} projects ls --next 1584722256178`)}
`);
};

const COMMAND_CONFIG = {
  ls: ['ls', 'list'],
  add: ['add'],
  rm: ['rm', 'remove'],
  connect: ['connect'],
};

export default async function main(client: Client) {
  let argv: any;
  let subcommand: string | string[];

  try {
    argv = getArgs(client.argv.slice(2), {
      '--next': Number,
      '-N': '--next',
      '--yes': Boolean,
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
  subcommand = argv._[0] || 'list';
  const args = argv._.slice(1);
  const yes = Boolean(argv['--yes']);
  const { output } = client;

  let paths = [process.cwd()];
  const pathValidation = await validatePaths(client, paths);
  if (!pathValidation.valid) {
    return pathValidation.exitCode;
  }
  const { path } = pathValidation;

  let link = await getLinkedProject(client, path);
  if (link.status === 'error') {
    return link.exitCode;
  }

  let org;
  let project;
  let contextName = '';
  let team;

  if (subcommand === 'connect') {
    // || subcommand === 'disconnect'
    const linkedProject = await ensureLink('project', client, path, yes);
    if (typeof linkedProject === 'number') {
      return linkedProject;
    }
    org = linkedProject.org;
    project = linkedProject.project;
  } else {
    try {
      ({ contextName, team } = await getScope(client));
    } catch (error) {
      if (error.code === 'NOT_AUTHORIZED' || error.code === 'TEAM_DELETED') {
        output.error(error.message);
        return 1;
      }
      throw error;
    }
  }

  switch (subcommand) {
    case 'ls':
      return list(client, argv, args, contextName);
    case 'add':
      return add(client, args, contextName);
    case 'rm':
      return rm(client, args);
    case 'connect':
      return connect(client, argv, args, project, org, team);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      help();
      return 2;
  }
}
