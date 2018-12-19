import chalk from 'chalk';
import table from 'text-table';
import mri from 'mri';
import ms from 'ms';
import plural from 'pluralize';
import strlen from '../util/strlen';
import { handleError, error } from '../util/error';
import ZeitAgent from '../util/zeit-agent';
import exit from '../util/exit';
import logo from '../util/output/logo';
import getScope from '../util/get-scope';
import wait from '../util/output/wait';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now list`)} [options]

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token
    -T, --team                     Set a custom team scope
    -P, --projects-limit           No. of projects to list (default: 5)

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} List recent deployments groups by the project

    ${chalk.cyan('$ now ls')}
`);
};

// Options
let argv;
let debug;
let apiUrl;
let subcommand;

const main = async ctx => {
  argv = mri(ctx.argv.slice(2), {
    boolean: ['help'],
    alias: {
      help: 'h',
      'projects-limit': 'P'
    }
  });

  argv._ = argv._.slice(1);

  debug = argv.debug;
  apiUrl = ctx.apiUrl;
  subcommand = argv._[0];

  const { authConfig: { token }, config: { currentTeam }} = ctx;

  const { contextName } = await getScope({
    apiUrl,
    token,
    debug,
    currentTeam
  });

  try {
    await run({ token, contextName, currentTeam });
  } catch (err) {
    handleError(err);
    exit(1);
  }
};

export default async ctx => {
  try {
    await main(ctx);
  } catch (err) {
    handleError(err);
    process.exit(1);
  }
};

async function run({ token, contextName, currentTeam }) {
  const args = argv._.slice(1);

  if (argv.help) {
    help();
    exit(0);
  }

  const agentProjects = new ZeitAgent('https://api.zeit.co', {token, teamId: currentTeam});
  const agentDeployments = new ZeitAgent('http://localhost:4008', {useHttp2:false, token, teamId: currentTeam});
  const start = Date.now();

  const stopSpinner = wait(
    `Fetching deployments in ${chalk.bold(contextName)}`
  );

  // Fetch most recent projects
  const projectsLimit = argv['projects-limit'] || 5;
  const recentProjects = await agentProjects.fetchAndThrow(
   `/projects/list?limit=${projectsLimit}&recentDeployments=1`
  );

  stopSpinner();

  console.log(chalk.gray('\n  This is a list of most recent deployments grouped by the project.\n'));

  for (let lc=0; lc<recentProjects.length; lc++) {
    const project = recentProjects[lc];
    const deployments = project.recentDeployments? project.recentDeployments.slice(0, 3) : [];

    const caption = `project: ${chalk.bold(project.name)}`
    console.log(`  ${caption}`);

    const now = Date.now();
    for (const deployment of deployments) {
      const updated = `${ms(now - deployment.createdAt)} ago`;
      console.log(`    * https://${deployment.url} - ${chalk.gray(updated)}`);
    }

    console.log('');
  }

  console.log(`  To list deployments of 10 projects, type: ${chalk.bold('now ls -P 10')}`);
  console.log(`  To list all projects, type: ${chalk.bold('now projects ls')}`);
  console.log(`  To list deployments of a project, type: ${chalk.bold('now ls --filter project=<name>')}`);
  console.log(`  To view all options, type: ${chalk.bold('now ls --help')}`);
  console.log('');

  agentProjects.close();
  agentDeployments.close();
  exit(1);
}

process.on('uncaughtException', err => {
  handleError(err);
  exit(1);
});

