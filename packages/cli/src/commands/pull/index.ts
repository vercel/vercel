import chalk from 'chalk';
import { join } from 'path';
import Client from '../../util/client';
import type { Project, ProjectLinked } from '@vercel-internals/types';
import { emoji, prependEmoji } from '../../util/emoji';
import { parseArguments } from '../../util/get-args';
import stamp from '../../util/output/stamp';
import { VERCEL_DIR, VERCEL_DIR_PROJECT } from '../../util/projects/link';
import { writeProjectSettings } from '../../util/projects/project-settings';
import envPull from '../env/pull';
import { ensureLink } from '../../util/link/ensure-link';
import humanizePath from '../../util/humanize-path';

import { help } from '../help';
import { pullCommand, type PullCommandFlags } from './command';
import parseTarget from '../../util/parse-target';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import handleError from '../../util/handle-error';

async function pullAllEnvFiles(
  environment: string,
  client: Client,
  link: ProjectLinked,
  project: Project,
  flags: PullCommandFlags,
  cwd: string
): Promise<number> {
  const environmentFile = `.env.${environment}.local`;
  return envPull(
    client,
    link,
    environment,
    flags,
    [join('.vercel', environmentFile)],
    cwd,
    'vercel-cli:pull'
  );
}

export default async function main(client: Client) {
  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(pullCommand.options);

  // Parse CLI args
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    handleError(error);
    return 1;
  }

  const { output } = client;

  if (parsedArgs.flags['--help']) {
    output.print(help(pullCommand, { columns: client.stderr.columns }));
    return 2;
  }

  let cwd = parsedArgs.args[1] || client.cwd;
  const autoConfirm = Boolean(parsedArgs.flags['--yes']);

  const link = await ensureLink('pull', client, cwd, { autoConfirm });
  if (typeof link === 'number') {
    return link;
  }

  const { project, org, repoRoot } = link;

  if (repoRoot) {
    cwd = join(repoRoot, project.rootDirectory || '');
  }

  client.config.currentTeam = org.type === 'team' ? org.id : undefined;

  const environment =
    parseTarget({
      output: client.output,
      flagName: 'environment',
      flags: parsedArgs.flags,
    }) || 'development';

  const pullResultCode = await pullAllEnvFiles(
    environment,
    client,
    link,
    project,
    parsedArgs.flags,
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
