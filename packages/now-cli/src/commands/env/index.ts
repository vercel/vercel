import chalk from 'chalk';

import { NowContext } from '../../types';
import createOutput from '../../util/output';
import getArgs from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import { getEnvTargetPlaceholder } from '../../util/env/env-target';
import { getLinkedProject } from '../../util/projects/link';
import Client from '../../util/client';
import handleError from '../../util/handle-error';
import logo from '../../util/output/logo';
import { getCommandName } from '../../util/pkg-name';

import add from './add';
import pull from './pull';
import ls from './ls';
import rm from './rm';

const help = () => {
  const placeholder = getEnvTargetPlaceholder();
  console.log(`
  ${chalk.bold(`${logo} now env`)} [options] <command>

  ${chalk.dim('Commands:')}

    ls      [environment]              List all variables for the specified Environment
    add     [name] [environment]       Add an Environment Variable (see examples below)
    rm      [name] [environment]       Remove an Environment Variable (see examples below)
    pull    [filename]                 Pull all Development Environment Variables from the cloud and write to a file [.env]

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.vercel`'} directory
    -d, --debug                    Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token
    -N, --next                     Show next page of results

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Add a new variable to multiple Environments

      ${chalk.cyan('$ now env add <name>')}
      ${chalk.cyan('$ now env add API_TOKEN')}

  ${chalk.gray('–')} Add a new variable for a specific Environment

      ${chalk.cyan(`$ now env add <name> ${placeholder}`)}
      ${chalk.cyan('$ now env add DB_CONNECTION production')}

  ${chalk.gray('–')} Add a new Environment Variable from stdin

      ${chalk.cyan(`$ cat <file> | now env add <name> ${placeholder}`)}
      ${chalk.cyan('$ cat ~/.npmrc | now env add NPM_RC preview')}
      ${chalk.cyan('$ now env add DB_PASS production < secret.txt')}

  ${chalk.gray('–')} Remove an variable from multiple Environments

      ${chalk.cyan('$ now env rm <name>')}
      ${chalk.cyan('$ now env rm API_TOKEN')}

  ${chalk.gray('–')} Remove a variable from a specific Environment

      ${chalk.cyan(`$ now env rm <name> ${placeholder}`)}
      ${chalk.cyan('$ now env rm NPM_RC preview')}

  ${chalk.gray('–')} Paginate results, where ${chalk.dim(
    '`1584722256178`'
  )} is the time in milliseconds since the UNIX epoch.

      ${chalk.cyan(`$ now env ls --next 1584722256178`)}
`);
};

const COMMAND_CONFIG = {
  ls: ['ls', 'list'],
  add: ['add'],
  rm: ['rm', 'remove'],
  pull: ['pull'],
};

export default async function main(ctx: NowContext) {
  let argv;

  try {
    argv = getArgs(ctx.argv.slice(2), {
      '--yes': Boolean,
      '-y': '--yes',
      '--next': Number,
      '-N': '--next',
    });
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }

  const debug = argv['--debug'];
  const output = createOutput({ debug });
  const { subcommand, args } = getSubcommand(argv._.slice(1), COMMAND_CONFIG);
  const {
    authConfig: { token },
    config,
  } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const client = new Client({ apiUrl, token, currentTeam, debug });
  const link = await getLinkedProject(output, client);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn’t linked to a project on Vercel. Run ${getCommandName()} to link it.`
    );
    return 1;
  } else {
    const { project, org } = link;
    client.currentTeam = org.type === 'team' ? org.id : undefined;
    switch (subcommand) {
      case 'ls':
        return ls(client, project, argv, args, output);
      case 'add':
        return add(client, project, argv, args, output);
      case 'rm':
        return rm(client, project, argv, args, output);
      case 'pull':
        return pull(client, project, argv, args, output);
      default:
        output.error(getInvalidSubcommand(COMMAND_CONFIG));
        help();
        return 2;
    }
  }
}
