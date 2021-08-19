import chalk from 'chalk';
import error from '../../util/output/error';
import logo from '../../util/output/logo';
import list from './list';
import add from './add';
import change from './switch';
import invite from './invite';
import { getPkgName } from '../../util/pkg-name';
import getArgs from '../../util/get-args';
import Client from '../../util/client';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} teams`)} [options] <command>

  ${chalk.dim('Commands:')}

    add                Create a new team
    ls                 Show all teams you're a part of
    switch   [name]    Switch to a different team
    invite   [email]   Invite a new member to a team

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.vercel`'} directory
    -d, --debug                    Debug mode [off]
    -N, --next                     Show next page of results

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Switch to a team

      ${chalk.cyan(`$ ${getPkgName()} switch <slug>`)}

      ${chalk.gray(
        '–'
      )} If your team's url is 'vercel.com/teams/name', 'name' is the slug
      ${chalk.gray('–')} If the slug is omitted, you can choose interactively

      ${chalk.yellow(
        'NOTE:'
      )} When you switch, everything you add, list or remove will be scoped that team!

  ${chalk.gray('–')} Invite new members (interactively)

      ${chalk.cyan(`$ ${getPkgName()} teams invite`)}

  ${chalk.gray('–')} Paginate results, where ${chalk.dim(
    '`1584722256178`'
  )} is the time in milliseconds since the UNIX epoch.

      ${chalk.cyan(`$ ${getPkgName()} teams ls --next 1584722256178`)}
  `);
};

export default async (client: Client) => {
  let subcommand;

  const argv = getArgs(client.argv.slice(2), undefined, { permissive: true });
  const isSwitch = argv._[0] === 'switch';

  argv._ = argv._.slice(1);

  if (isSwitch) {
    subcommand = 'switch';
  } else {
    subcommand = argv._.shift();
  }

  if (argv['--help'] || !subcommand) {
    help();
    return 2;
  }

  let exitCode = 0;
  switch (subcommand) {
    case 'list':
    case 'ls': {
      exitCode = await list(client);
      break;
    }
    case 'switch':
    case 'change': {
      exitCode = await change(client, argv._[0]);
      break;
    }
    case 'add':
    case 'create': {
      exitCode = await add(client);
      break;
    }

    case 'invite': {
      exitCode = await invite(client, argv);
      break;
    }
    default: {
      if (subcommand !== 'help') {
        console.error(
          error('Please specify a valid subcommand: add | ls | switch | invite')
        );
      }
      exitCode = 2;
      help();
    }
  }
  return exitCode;
};
