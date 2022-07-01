import chalk from 'chalk';
import Client from '../util/client';
import getArgs from '../util/get-args';
import getScope from '../util/get-scope';
import handleError from '../util/handle-error';
import logo from '../util/output/logo';
import { getCommandName, getPkgName } from '../util/pkg-name';
import validatePaths from '../util/validate-paths';
import { ensureLink } from '../util/link-project';
import list from '../util/input/list';
import { Org, Project, Team } from '../types';
import { stringify } from 'querystring';
import execa from 'execa';
import link from '../util/output/link';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} open`)} [options]

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    --prod                         Use the production environment
    --yes                          Skip confirmation prompts
    dash                           Open the dashboard in a browser
    inspect                      Open the inspector URL for the latest deployment in a browser
    deploy                         Open the latest deployment URL in a browser
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.vercel`'} directory

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Open the dashboard for the current project in a browser

    ${chalk.cyan(`$ ${getPkgName()} open dash`)}

  ${chalk.gray(
    '–'
  )} Open the inspector URL for the latest preview deployment in a browser

    ${chalk.cyan(`$ ${getPkgName()} open inspect`)}

  ${chalk.gray(
    '–'
  )} Open the inspector URL for the latest production deployment in a browser

    ${chalk.cyan(`$ ${getPkgName()} open inspect --prod`)}

  ${chalk.gray('–')} Open the latest preview deployment URL in a browser

    ${chalk.cyan(`$ ${getPkgName()} open deploy`)}

  ${chalk.gray('–')} Open the latest production deployment URL in a browser

    ${chalk.cyan(`$ ${getPkgName()} open deploy --prod`)}
`);
};

export default async function open(client: Client): Promise<number> {
  const { output } = client;
  let argv;
  let subcommand: string | string[];

  try {
    argv = getArgs(client.argv.slice(2), {
      '--yes': Boolean,
      '--prod': Boolean,
    });
  } catch (error) {
    handleError(error);
    return 1;
  }

  argv._ = argv._.slice(1);
  subcommand = argv._[0];

  if (argv['--help']) {
    help();
    return 2;
  }

  const yes = argv['--yes'] || false;
  const prod = argv['--prod'] || false;

  let scope = null;

  try {
    scope = await getScope(client);
  } catch (err) {
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  const { team } = scope;

  let paths = [process.cwd()];

  const validate = await validatePaths(client, paths);
  if (!validate.valid) {
    return validate.exitCode;
  }
  const { path } = validate;

  const linkedProject = await ensureLink('open', client, path, yes);
  if (typeof linkedProject === 'number') {
    return linkedProject;
  }

  const { project, org } = linkedProject;
  client.config.currentTeam = org.type === 'team' ? org.id : undefined;

  const dashboardUrl = getDashboardUrl(org, project);
  const inspectorUrl = await getInspectorUrl(client, project, org, team);
  const prodInspectorUrl = await getInspectorUrl(
    client,
    project,
    org,
    team,
    true
  );
  const latestDeployment = await getLatestDeploymentUrl(client, project, team);
  const latestProdDeployment = await getLatestDeploymentUrl(
    client,
    project,
    team,
    true
  );

  let choice = '';

  if (subcommand === 'dash') {
    choice = dashboardUrl;
  } else if (subcommand === 'deploy') {
    choice = (prod ? latestProdDeployment : latestDeployment) || 'not_found';
  } else if (subcommand === 'inspect') {
    choice = (prod ? prodInspectorUrl : inspectorUrl) || 'not_found';
  } else {
    choice = await list(client, {
      message: 'What do you want to open?',
      choices: [
        {
          name: 'Dashboard',
          value: dashboardUrl,
          short: 'Dashboard',
        },
        {
          name: 'Latest Preview Deployment',
          value: latestDeployment || 'not_found',
          short: 'Latest Preview Deployment',
        },
        {
          name: 'Inspect Latest Preview Deployment',
          value: inspectorUrl || 'not_found',
          short: 'Deployment Inspector',
        },
        {
          name: 'Latest Production Deployment',
          value: latestProdDeployment || 'not_found',
          short: 'Latest Production Deployment',
        },
        {
          name: 'Inspect Latest Production Deployment',
          value: prodInspectorUrl || 'not_found',
          short: 'Latest Production Deployment Inspector',
        },
      ],
    });
  }

  if (choice === 'not_found') {
    output.log(
      `No deployments found. Run ${chalk.cyan(
        getCommandName('deploy')
      )} to create a deployment.`
    );
    return 1;
  }
  if (choice === '') {
    // User aborted
    return 0;
  }

  execa('open', [choice]);
  output.log(`🪄 Opened ${link(choice)}`);
  return 0;
}

function getDashboardUrl(org: Org, project: Project): string {
  return `https://vercel.com/${org.slug}/${project.name}`;
}
async function getInspectorUrl(
  client: Client,
  project: Project,
  org: Org,
  team: Team | null,
  prod: Boolean = false
): Promise<string | undefined> {
  const proj = await getProject(client, project, team);
  if (proj) {
    let latestDeploymentId = (
      prod ? proj?.targets?.production?.id : proj.latestDeployments?.[0]?.id
    )?.replace('dpl_', '');
    if (latestDeploymentId) {
      return `https://vercel.com/${org.slug}/${project.name}/${latestDeploymentId}`;
    }
  }
}
async function getLatestDeploymentUrl(
  client: Client,
  project: Project,
  team: Team | null,
  prod: Boolean = false
): Promise<string | undefined> {
  const proj = await getProject(client, project, team);
  if (prod && proj?.targets?.production) {
    return `https://${proj.targets.production.url}`;
  } else {
    if (proj?.latestDeployments?.[0]?.url) {
      return `https://${proj.latestDeployments[0].url}`;
    }
  }
}

async function getProject(
  client: Client,
  project: Project,
  team: Team | null
): Promise<Project | undefined> {
  const proj = await client
    .fetch(
      `/v9/projects/${project.name}?${stringify({
        teamId: team?.id,
      })}`
    )
    .catch(err => {
      client.output.error(err.message);
      return undefined;
    });
  return proj as Project;
}
