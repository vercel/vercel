import chalk from 'chalk';
import error from '../util/output/error';
import NowTeams from '../util/teams';
import logo from '../util/output/logo';
import list from './teams/list';
import add from './teams/add';
import change from './teams/switch';
import invite from './teams/invite';
import { getPkgName } from '../util/pkg-name.ts';
import getArgs from '../util/get-args.ts';
import handleError from '../util/handle-error.ts';

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

let argv;
let debug;
let apiUrl;
let subcommand;

const main = async client => {
  try {
    argv = getArgs(client.argv.slice(2), {
      '--since': String,
      '--until': String,
      '--next': Number,
      '-N': '--next',
    });
  } catch (error) {
    handleError(error);
    return 1;
  }

  debug = argv['--debug'];
  apiUrl = client.apiUrl;

  const isSwitch = argv._[0] && argv._[0] === 'switch';

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

  const {
    authConfig: { token },
    config,
  } = client;

  const { currentTeam } = config;
  const teams = new NowTeams({ apiUrl, token, debug, currentTeam });

  let exitCode;
  switch (subcommand) {
    case 'list':
    case 'ls': {
      exitCode = await list(client, argv, teams);
      break;
    }
    case 'switch':
    case 'change': {
      exitCode = await change(client, argv);
      break;
    }
    case 'add':
    case 'create': {
      exitCode = await add(client, teams);
      break;
    }

    case 'invite': {
      exitCode = await invite(client, argv, teams);
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
  teams.close();
  return exitCode || 0;
};

export default async client => {
  try {
    return await main(client);
  } catch (err) {
    console.error(err);
    handleError(err);
    return 1;
  }
};
