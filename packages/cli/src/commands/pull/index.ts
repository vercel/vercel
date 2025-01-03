import chalk from 'chalk';
import { join } from 'node:path';
import type Client from '../../util/client';
import type { ProjectEnvTarget, ProjectLinked } from '@vercel-internals/types';
import { emoji, prependEmoji } from '../../util/emoji';
import { parseArguments } from '../../util/get-args';
import stamp from '../../util/output/stamp';
import { VERCEL_DIR, VERCEL_DIR_PROJECT } from '../../util/projects/link';
import { writeProjectSettings } from '../../util/projects/project-settings';
import { envPullCommandLogic } from '../env/pull';
import {
  isValidEnvTarget,
  getEnvTargetPlaceholder,
} from '../../util/env/env-target';
import { ensureLink } from '../../util/link/ensure-link';
import humanizePath from '../../util/humanize-path';

import { help } from '../help';
import { pullCommand, type PullCommandFlags } from './command';
import parseTarget from '../../util/parse-target';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { PullTelemetryClient } from '../../util/telemetry/commands/pull';

async function pullAllEnvFiles(
  environment: string,
  client: Client,
  link: ProjectLinked,
  flags: PullCommandFlags,
  cwd: string
): Promise<number> {
  const environmentFile = `.env.${environment}.local`;

  await envPullCommandLogic(
    client,
    join('.vercel', environmentFile),
    !!flags['--yes'],
    environment,
    link,
    flags['--git-branch'],
    cwd,
    'vercel-cli:pull'
  );

  return 0;
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
  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(pullCommand.options);

  // Parse CLI args
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const telemetryClient = new PullTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  if (parsedArgs.flags['--help']) {
    telemetryClient.trackCliFlagHelp('pull');
    output.print(help(pullCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const cwd = parsedArgs.args[1] || client.cwd;
  const autoConfirm = Boolean(parsedArgs.flags['--yes']);
  const isProduction = Boolean(parsedArgs.flags['--prod']);
  const environment =
    parseTarget({
      flagName: 'environment',
      flags: parsedArgs.flags,
    }) || 'development';

  telemetryClient.trackCliArgumentProjectPath(parsedArgs.args[1]);
  telemetryClient.trackCliFlagYes(autoConfirm);
  telemetryClient.trackCliFlagProd(isProduction);
  telemetryClient.trackCliOptionGitBranch(parsedArgs.flags['--git-branch']);
  telemetryClient.trackCliOptionEnvironment(parsedArgs.flags['--environment']);

  const returnCode = await pullCommandLogic(
    client,
    cwd,
    autoConfirm,
    environment,
    parsedArgs.flags
  );
  return returnCode;
}

export async function pullCommandLogic(
  client: Client,
  cwd: string,
  autoConfirm: boolean,
  environment: string,
  flags: PullCommandFlags
): Promise<number> {
  const link = await ensureLink('pull', client, cwd, { autoConfirm });
  if (typeof link === 'number') {
    return link;
  }

  const { project, org, repoRoot } = link;

  let currentDirectory: string;
  if (repoRoot) {
    currentDirectory = join(repoRoot, project.rootDirectory || '');
  } else {
    currentDirectory = cwd;
  }

  client.config.currentTeam = org.type === 'team' ? org.id : undefined;

  const pullResultCode = await pullAllEnvFiles(
    environment,
    client,
    link,
    flags,
    currentDirectory
  );
  if (pullResultCode !== 0) {
    return pullResultCode;
  }

  output.print('\n');
  output.log('Downloading project settings');
  const isRepoLinked = typeof repoRoot === 'string';
  await writeProjectSettings(currentDirectory, project, org, isRepoLinked);

  const settingsStamp = stamp();
  output.print(
    `${prependEmoji(
      `Downloaded project settings to ${chalk.bold(
        humanizePath(join(currentDirectory, VERCEL_DIR, VERCEL_DIR_PROJECT))
      )} ${chalk.gray(settingsStamp())}`,
      emoji('success')
    )}\n`
  );

  return 0;
}
