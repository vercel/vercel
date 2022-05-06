import chalk from 'chalk';
import { join } from 'path';
import Client from '../util/client';
import { ProjectEnvTarget } from '../types';
import { emoji, prependEmoji } from '../util/emoji';
import getArgs from '../util/get-args';
import setupAndLink from '../util/link/setup-and-link';
import logo from '../util/output/logo';
import stamp from '../util/output/stamp';
import { getPkgName } from '../util/pkg-name';
import {
  getLinkedProject,
  VERCEL_DIR,
  VERCEL_DIR_PROJECT,
} from '../util/projects/link';
import { writeProjectSettings } from '../util/projects/project-settings';
import envPull from './env/pull';

import type { Project, Org } from '../types';
import {
  isValidEnvTarget,
  getEnvTargetPlaceholder,
} from '../util/env/env-target';

const help = () => {
  return console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} pull`)} [path]

 ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.vercel`'} directory
    -d, --debug                    Debug mode [off]
    --environment [environment]    Deployment environment [development]
    -y, --yes                      Skip the confirmation prompt

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Pull the latest Project Settings from the cloud

    ${chalk.cyan(`$ ${getPkgName()} pull`)}
    ${chalk.cyan(`$ ${getPkgName()} pull ./path-to-project`)}
    ${chalk.cyan(`$ ${getPkgName()} pull --env .env.local`)}
    ${chalk.cyan(`$ ${getPkgName()} pull ./path-to-project --env .env.local`)}

  ${chalk.gray('–')} Pull specific environment's Project Settings from the cloud

    ${chalk.cyan(
      `$ ${getPkgName()} pull --environment=${getEnvTargetPlaceholder()}`
    )}
`);
};

function processArgs(client: Client) {
  return getArgs(client.argv.slice(2), {
    '--yes': Boolean,
    '--env': String, // deprecated
    '--environment': String,
    '--debug': Boolean,
    '-d': '--debug',
    '-y': '--yes',
  });
}

function parseArgs(client: Client) {
  const argv = processArgs(client);

  if (argv['--help']) {
    help();
    return 2;
  }

  return argv;
}

type LinkResult = {
  org: Org;
  project: Project;
};
async function ensureLink(
  client: Client,
  cwd: string,
  yes: boolean
): Promise<LinkResult | number> {
  let link = await getLinkedProject(client, cwd);
  if (link.status === 'not_linked') {
    link = await setupAndLink(client, cwd, {
      autoConfirm: yes,
      successEmoji: 'link',
      setupMsg: 'Set up',
    });

    if (link.status === 'not_linked') {
      // User aborted project linking questions
      return 0;
    }
  }

  if (link.status === 'error') {
    return link.exitCode;
  }

  return { org: link.org, project: link.project };
}

async function pullAllEnvFiles(
  environment: ProjectEnvTarget,
  client: Client,
  project: Project,
  argv: ReturnType<typeof processArgs>,
  cwd: string
): Promise<number> {
  const environmentFile = `.env.${environment}.local`;
  return envPull(
    client,
    project,
    environment,
    argv,
    [join('.vercel', environmentFile)],
    client.output,
    cwd,
    'vercel-cli:pull'
  );
}

function parseEnvironment(environment = 'development'): ProjectEnvTarget {
  if (!isValidEnvTarget(environment)) {
    throw new Error(
      `environment "${environment}" not supported; must be one of ${getEnvTargetPlaceholder()}`
    );
  }
  return environment;
}

export default async function main(client: Client) {
  const argv = parseArgs(client);
  if (typeof argv === 'number') {
    return argv;
  }

  const cwd = argv._[1] || process.cwd();
  const yes = Boolean(argv['--yes']);
  const environment = parseEnvironment(argv['--environment'] || undefined);

  const link = await ensureLink(client, cwd, yes);
  if (typeof link === 'number') {
    return link;
  }

  const { project, org } = link;

  client.config.currentTeam = org.type === 'team' ? org.id : undefined;

  const pullResultCode = await pullAllEnvFiles(
    environment,
    client,
    project,
    argv,
    cwd
  );
  if (pullResultCode !== 0) {
    return pullResultCode;
  }

  await writeProjectSettings(cwd, project, org);

  const settingsStamp = stamp();
  client.output.print(
    `${prependEmoji(
      `Downloaded project settings to ${chalk.bold(
        join(VERCEL_DIR, VERCEL_DIR_PROJECT)
      )} ${chalk.gray(settingsStamp())}`,
      emoji('success')
    )}\n`
  );

  return 0;
}
