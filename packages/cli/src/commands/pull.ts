import chalk from 'chalk';
import { join } from 'path';
import Client from '../util/client';
import type {
  Project,
  ProjectEnvTarget,
  ProjectLinked,
} from '@vercel-internals/types';
import { emoji, prependEmoji } from '../util/emoji';
import getArgs from '../util/get-args';
import logo from '../util/output/logo';
import stamp from '../util/output/stamp';
import { getPkgName } from '../util/pkg-name';
import { VERCEL_DIR, VERCEL_DIR_PROJECT } from '../util/projects/link';
import { writeProjectSettings } from '../util/projects/project-settings';
import envPull from './env/pull';
import {
  isValidEnvTarget,
  getEnvTargetPlaceholder,
} from '../util/env/env-target';
import { ensureLink } from '../util/link/ensure-link';
import humanizePath from '../util/humanize-path';

const help = () => {
  return console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} pull`)} [project-path]

 ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.vercel`'} directory
    -d, --debug                    Debug mode [off]
    --no-color                     No color mode [off]
    --environment [environment]    Deployment environment [development]
    -y, --yes                      Skip questions when setting up new project using default scope and settings

  ${chalk.dim('Examples:')}

  ${chalk.gray(
    '–'
  )} Pull the latest Environment Variables and Project Settings from the cloud
    and stores them in \`.vercel/.env.\${target}.local\` and \`.vercel/project.json\` respectively.

    ${chalk.cyan(`$ ${getPkgName()} pull`)}
    ${chalk.cyan(`$ ${getPkgName()} pull ./path-to-project`)}

  ${chalk.gray('–')} Pull for a specific environment

    ${chalk.cyan(
      `$ ${getPkgName()} pull --environment=${getEnvTargetPlaceholder()}`
    )}

  ${chalk.gray(
    'If you want to download environment variables to a specific file, use `vercel env pull` instead.'
  )}
`);
};

function processArgs(client: Client) {
  return getArgs(client.argv.slice(2), {
    '--yes': Boolean,
    '--environment': String,
    '--git-branch': String,
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

async function pullAllEnvFiles(
  environment: ProjectEnvTarget,
  client: Client,
  link: ProjectLinked,
  project: Project,
  argv: ReturnType<typeof processArgs>,
  cwd: string
): Promise<number> {
  const environmentFile = `.env.${environment}.local`;
  return envPull(
    client,
    link,
    project,
    environment,
    argv,
    [join('.vercel', environmentFile)],
    client.output,
    cwd,
    'vercel-cli:pull'
  );
}

export function parseEnvironment(
  environment = 'development'
): ProjectEnvTarget {
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

  let cwd = argv._[1] || client.cwd;
  const autoConfirm = Boolean(argv['--yes']);
  const environment = parseEnvironment(argv['--environment'] || undefined);

  const link = await ensureLink('pull', client, cwd, { autoConfirm });
  if (typeof link === 'number') {
    return link;
  }

  const { project, org, repoRoot } = link;

  if (repoRoot) {
    cwd = join(repoRoot, project.rootDirectory || '');
  }

  client.config.currentTeam = org.type === 'team' ? org.id : undefined;

  const pullResultCode = await pullAllEnvFiles(
    environment,
    client,
    link,
    project,
    argv,
    cwd
  );
  if (pullResultCode !== 0) {
    return pullResultCode;
  }

  client.output.print('\n');
  client.output.log('Downloading project settings');
  const isRepoLinked = typeof repoRoot === 'string';
  await writeProjectSettings(cwd, project, org, isRepoLinked);

  const settingsStamp = stamp();
  client.output.print(
    `${prependEmoji(
      `Downloaded project settings to ${chalk.bold(
        humanizePath(join(cwd, VERCEL_DIR, VERCEL_DIR_PROJECT))
      )} ${chalk.gray(settingsStamp())}`,
      emoji('success')
    )}\n`
  );

  return 0;
}
