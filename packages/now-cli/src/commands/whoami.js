import mri from 'mri';
import chalk from 'chalk';
import logo from '../util/output/logo';
import { handleError } from '../util/error';
import Client from '../util/client.ts';
import getScope from '../util/get-scope.ts';
import createOutput from '../util/output';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now whoami`)}

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`now.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.now`'} directory
    -d, --debug                    Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Shows the username of the currently logged in user

    ${chalk.cyan('$ now whoami')}
`);
};

// Options
let argv;

const main = async ctx => {
  argv = mri(ctx.argv.slice(2), {
    boolean: ['help', 'debug', 'all'],
    alias: {
      help: 'h',
      debug: 'd',
    },
  });

  argv._ = argv._.slice(1);

  if (argv.help || argv._[0] === 'help') {
    help();
    process.exit(0);
  }

  const debug = argv['--debug'];
  const {
    authConfig: { token },
    apiUrl,
  } = ctx;
  const output = createOutput({ debug });

  const clientOpts = {
    apiUrl,
    token,
    debug,
  };

  const client = new Client({ ...clientOpts });
  const clientWithOrg = new Client({
    ...clientOpts,
    currentTeam: ctx.config.currentTeam,
  });

  let contextName = null;
  let orgContextName = null;

  try {
    const [scope, scopeWithTeam] = await Promise.all([
      getScope(client),
      getScope(clientWithOrg),
    ]);

    contextName = scope.contextName;
    orgContextName = scopeWithTeam.contextName;
  } catch (err) {
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  await whoami(contextName, orgContextName);
};

export default async ctx => {
  try {
    await main(ctx);
  } catch (err) {
    handleError(err);
    process.exit(1);
  }
};

async function whoami(contextName, orgContextName) {
  if (process.stdout.isTTY) {
    process.stdout.write('> ');
  }

  if (contextName === orgContextName) {
    console.log(contextName);
  } else {
    console.log(`${contextName} (team: ${orgContextName})`);
  }
}
