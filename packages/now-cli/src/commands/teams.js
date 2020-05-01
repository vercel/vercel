import chalk from 'chalk';
import mri from 'mri';
import error from '../util/output/error';
import NowTeams from '../util/teams';
import logo from '../util/output/logo';
import exit from '../util/exit';
import { handleError } from '../util/error';
import list from './teams/list';
import add from './teams/add';
import change from './teams/switch';
import invite from './teams/invite';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now teams`)} [options] <command>

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

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Switch to a team

      ${chalk.cyan(`$ now switch <slug>`)}

      ${chalk.gray(
        '–'
      )} If your team's url is 'vercel.com/teams/name', 'name' is the slug
      ${chalk.gray('–')} If the slug is omitted, you can choose interactively

      ${chalk.yellow(
        'NOTE:'
      )} When you switch, everything you add, list or remove will be scoped that team!

  ${chalk.gray('–')} Invite new members (interactively)

      ${chalk.cyan(`$ now teams invite`)}
  `);
};

let argv;
let debug;
let apiUrl;
let subcommand;

const main = async ctx => {
  argv = mri(ctx.argv.slice(2), {
    boolean: ['help', 'debug'],
    alias: {
      help: 'h',
      debug: 'd',
      switch: 'change',
    },
  });

  debug = argv.debug;
  apiUrl = ctx.apiUrl;

  const isSwitch = argv._[0] && argv._[0] === 'switch';

  argv._ = argv._.slice(1);

  if (isSwitch) {
    subcommand = 'switch';
  } else {
    subcommand = argv._.shift();
  }

  if (argv.help || !subcommand) {
    help();
    await exit(0);
  }

  const {
    authConfig: { token },
    config,
  } = ctx;

  return run({ token, config });
};

export default async ctx => {
  try {
    return main(ctx);
  } catch (err) {
    handleError(err);
    return 1;
  }
};

async function run({ token, config }) {
  const { currentTeam } = config;
  const teams = new NowTeams({ apiUrl, token, debug, currentTeam });
  const args = argv._;

  let exitCode;
  switch (subcommand) {
    case 'list':
    case 'ls': {
      exitCode = await list({
        teams,
        config,
        apiUrl,
        token,
      });
      break;
    }
    case 'switch':
    case 'change': {
      exitCode = await change({
        args,
        config,
        apiUrl,
        token,
        debug,
      });
      break;
    }
    case 'add':
    case 'create': {
      exitCode = await add({ apiUrl, token, teams, config });
      break;
    }

    case 'invite': {
      exitCode = await invite({
        teams,
        args,
        config,
        apiUrl,
        token,
      });
      break;
    }
    default: {
      if (subcommand !== 'help') {
        console.error(
          error('Please specify a valid subcommand: add | ls | switch | invite')
        );
        exitCode = 1;
      }
      help();
    }
  }
  teams.close();
  return exitCode || 0;
}
