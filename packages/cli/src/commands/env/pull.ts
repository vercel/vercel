import * as dotenvx from '@dotenvx/dotenvx';
import type { ProjectLinked } from '@vercel-internals/types';
import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { outputFile } from 'fs-extra';
import { join, resolve } from 'path';
import output from '../../output-manager';
import type Client from '../../util/client';
import { emoji, prependEmoji } from '../../util/emoji';
import { buildDeltaString } from '../../util/env/diff-env-files';
import {
  type EnvRecordsSource,
  pullEnvRecords,
} from '../../util/env/get-env-records';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { addToGitIgnore } from '../../util/link/add-to-gitignore';
import stamp from '../../util/output/stamp';
import parseTarget from '../../util/parse-target';
import { getCommandName } from '../../util/pkg-name';
import { formatProject } from '../../util/projects/format-project';
import { getLinkedProject } from '../../util/projects/link';
import { EnvPullTelemetryClient } from '../../util/telemetry/commands/env/pull';
import { pullSubcommand } from './command';

const CONTENTS_PREFIX = '# Created by Vercel CLI\n';

const VARIABLES_TO_IGNORE = [
  'VERCEL_ANALYTICS_ID',
  'VERCEL_SPEED_INSIGHTS_ID',
  'VERCEL_WEB_ANALYTICS_ID',
];

export default async function pull(client: Client, argv: string[]) {
  const telemetryClient = new EnvPullTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(pullSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags: opts } = parsedArgs;

  if (args.length > 1) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(`env pull <file>`)}`
    );
    return 1;
  }

  // handle relative or absolute filename
  const [rawFilename] = args;
  const filename = rawFilename || '.env.local';
  const gitBranch = opts['--git-branch'];

  telemetryClient.trackCliArgumentFilename(args[0]);
  telemetryClient.trackCliOptionGitBranch(gitBranch);
  telemetryClient.trackCliOptionEnvironment(opts['--environment']);

  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn’t linked to a project on Vercel. Run ${getCommandName(
        'link'
      )} to begin.`
    );
    return 1;
  }
  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const environment =
    parseTarget({
      flagName: 'environment',
      flags: opts,
    }) || 'development';

  await envPullCommandLogic(
    client,
    filename,
    environment,
    link,
    gitBranch,
    client.cwd,
    'vercel-cli:env:pull'
  );

  return 0;
}

export async function envPullCommandLogic(
  client: Client,
  filename: string,
  environment: string,
  link: ProjectLinked,
  gitBranch: string | undefined,
  cwd: string,
  source: EnvRecordsSource
) {
  const fullPath = resolve(cwd, filename);
  const exists = existsSync(fullPath);

  const projectSlugLink = formatProject(link.org.slug, link.project.name);

  output.log(
    `Downloading \`${chalk.cyan(
      environment
    )}\` Environment Variables for ${projectSlugLink}`
  );

  const pullStamp = stamp();
  output.spinner('Downloading');

  const records = (
    await pullEnvRecords(client, link.project.id, source, {
      target: environment || 'development',
      gitBranch,
    })
  ).env;

  let deltaString = '';
  let oldEnv: Record<string, string | undefined> = {};

  if (exists) {
    try {
      const fileContent = readFileSync(fullPath, 'utf8');
      oldEnv = dotenvx.parse(fileContent, { processEnv: {} });
    } catch (error) {
      throw new Error(
        `Failed to parse existing env file at ${fullPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  } else {
    try {
      await outputFile(fullPath, CONTENTS_PREFIX, 'utf8');
    } catch (error) {
      throw new Error(
        `Failed to create env file at ${fullPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const newEnv = Object.fromEntries(
    Object.entries(records).filter(
      ([key]) => !VARIABLES_TO_IGNORE.includes(key)
    )
  );
  deltaString = buildDeltaString(oldEnv, newEnv);

  const encrypt = existsSync(join(cwd, '.env.keys'));

  for (const [key, value] of Object.entries(newEnv)) {
    try {
      dotenvx.set(key, value ?? '', { path: fullPath, encrypt });
    } catch (error) {
      throw new Error(
        `Failed to set environment variable ${key}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (deltaString) {
    output.print('\n' + deltaString);
  } else if (oldEnv && exists) {
    output.log('No changes found.');
  }

  let isGitIgnoreUpdated = false;
  if (filename === '.env.local') {
    // When the file is `.env.local`, we also add it to `.gitignore`
    // to avoid accidentally committing it to git.
    // We use '.env*.local' to match the default .gitignore from
    // create-next-app template. See:
    // https://github.com/vercel/next.js/blob/06abd634899095b6cc28e6e8315b1e8b9c8df939/packages/create-next-app/templates/app/js/gitignore#L28
    const rootPath = link.repoRoot ?? cwd;
    isGitIgnoreUpdated = await addToGitIgnore(rootPath, '.env*.local');
  }

  output.print(
    `${prependEmoji(
      `${exists ? 'Updated' : 'Created'} ${chalk.bold(filename)} file ${
        isGitIgnoreUpdated ? 'and added it to .gitignore' : ''
      } ${chalk.gray(pullStamp())}`,
      emoji('success')
    )}\n`
  );
}
