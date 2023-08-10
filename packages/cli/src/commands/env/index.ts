import chalk from 'chalk';
import Client from '../../util/client';
import {
  getEnvTargetPlaceholder,
  isValidEnvTarget,
} from '../../util/env/env-target';
import getArgs from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import handleError from '../../util/handle-error';
import { getCommandName, packageName, logo } from '../../util/pkg-name';
import { getLinkedProject } from '../../util/projects/link';
import add from './add';
import ls from './ls';
import pull from './pull';
import rm from './rm';

const help = () => {
  const targetPlaceholder = getEnvTargetPlaceholder();
  console.log(`
  ${chalk.bold(`${logo} ${packageName} env`)} [options] <command>

  ${chalk.dim('Commands:')}

    ls      [environment] [gitbranch]         List all variables for the specified Environment
    add     [name] [environment] [gitbranch]  Add an Environment Variable (see examples below)
    rm      [name] [environment] [gitbranch]  Remove an Environment Variable (see examples below)
    pull    [filename]                        Pull all Development Environment Variables from the cloud and write to a file [.env.local]

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    --environment                  Set the Environment (development, preview, production) when pulling Environment Variables
    --git-branch                   Specify the Git branch to pull specific Environment Variables for
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
    -y, --yes                      Skip the confirmation prompt when overwriting env file on pull or removing an env variable

  ${chalk.dim('Examples:')}

  ${chalk.gray(
    '–'
  )} Pull all Development Environment Variables down from the cloud

      ${chalk.cyan(`$ ${packageName} env pull <file>`)}
      ${chalk.cyan(`$ ${packageName} env pull .env.development.local`)}

  ${chalk.gray('–')} Add a new variable to multiple Environments

      ${chalk.cyan(`$ ${packageName} env add <name>`)}
      ${chalk.cyan(`$ ${packageName} env add API_TOKEN`)}

  ${chalk.gray('–')} Add a new variable for a specific Environment

      ${chalk.cyan(`$ ${packageName} env add <name> ${targetPlaceholder}`)}
      ${chalk.cyan(`$ ${packageName} env add DB_PASS production`)}

  ${chalk.gray(
    '–'
  )} Add a new variable for a specific Environment and Git Branch

      ${chalk.cyan(
        `$ ${packageName} env add <name> ${targetPlaceholder} <gitbranch>`
      )}
      ${chalk.cyan(`$ ${packageName} env add DB_PASS preview feat1`)}

  ${chalk.gray('–')} Add a new Environment Variable from stdin

      ${chalk.cyan(
        `$ cat <file> | ${packageName} env add <name> ${targetPlaceholder}`
      )}
      ${chalk.cyan(`$ cat ~/.npmrc | ${packageName} env add NPM_RC preview`)}
      ${chalk.cyan(`$ ${packageName} env add API_URL production < url.txt`)}

  ${chalk.gray('–')} Remove a variable from multiple Environments

      ${chalk.cyan(`$ ${packageName} env rm <name>`)}
      ${chalk.cyan(`$ ${packageName} env rm API_TOKEN`)}

  ${chalk.gray('–')} Remove a variable from a specific Environment

      ${chalk.cyan(`$ ${packageName} env rm <name> ${targetPlaceholder}`)}
      ${chalk.cyan(`$ ${packageName} env rm NPM_RC preview`)}

  ${chalk.gray(
    '–'
  )} Remove a variable from a specific Environment and Git Branch

      ${chalk.cyan(
        `$ ${packageName} env rm <name> ${targetPlaceholder} <gitbranch>`
      )}
      ${chalk.cyan(`$ ${packageName} env rm NPM_RC preview feat1`)}
`);
};

const COMMAND_CONFIG = {
  ls: ['ls', 'list'],
  add: ['add'],
  rm: ['rm', 'remove'],
  pull: ['pull'],
};

export default async function main(client: Client) {
  let argv;

  try {
    argv = getArgs(client.argv.slice(2), {
      '--yes': Boolean,
      '-y': '--yes',
      '--environment': String,
      '--git-branch': String,
    });
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }

  const subArgs = argv._.slice(1);
  const { subcommand, args } = getSubcommand(subArgs, COMMAND_CONFIG);
  const { cwd, output, config } = client;

  const target = argv['--environment']?.toLowerCase() || 'development';
  if (!isValidEnvTarget(target)) {
    output.error(
      `Invalid environment \`${chalk.cyan(
        target
      )}\`. Valid options: ${getEnvTargetPlaceholder()}`
    );
    return 1;
  }

  const link = await getLinkedProject(client, cwd);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn’t linked to a project on Vercel. Run ${getCommandName(
        'link'
      )} to begin.`
    );
    return 1;
  } else {
    const { project, org } = link;
    config.currentTeam = org.type === 'team' ? org.id : undefined;
    switch (subcommand) {
      case 'ls':
        return ls(client, project, argv, args, output);
      case 'add':
        return add(client, project, argv, args, output);
      case 'rm':
        return rm(client, project, argv, args, output);
      case 'pull':
        return pull(
          client,
          link,
          project,
          target,
          argv,
          args,
          output,
          cwd,
          'vercel-cli:env:pull'
        );
      default:
        output.error(getInvalidSubcommand(COMMAND_CONFIG));
        help();
        return 2;
    }
  }
}
