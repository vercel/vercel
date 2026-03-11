import chalk from 'chalk';
import { outputFile } from 'fs-extra';
import { closeSync, openSync, readSync } from 'fs';
import { resolve } from 'path';
import type Client from '../../util/client';
import { emoji, prependEmoji } from '../../util/emoji';
import param from '../../util/output/param';
import stamp from '../../util/output/stamp';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import {
  type EnvRecordsSource,
  pullEnvRecords,
} from '../../util/env/get-env-records';
import {
  buildDeltaString,
  createEnvObject,
} from '../../util/env/diff-env-files';
import { isErrnoException } from '@vercel/error-utils';
import { addToGitIgnore } from '../../util/link/add-to-gitignore';
import { formatProject } from '../../util/projects/format-project';
import type { ProjectLinked } from '@vercel-internals/types';
import output from '../../output-manager';
import { EnvPullTelemetryClient } from '../../util/telemetry/commands/env/pull';
import { pullSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import parseTarget from '../../util/parse-target';
import { getLinkedProject } from '../../util/projects/link';
import {
  buildCommandWithYes,
  getPreservedArgsForEnvPull,
  outputActionRequired,
  outputAgentError,
} from '../../util/agent-output';

const CONTENTS_PREFIX = '# Created by Vercel CLI\n';

function readHeadSync(path: string, length: number) {
  const buffer = Buffer.alloc(length);
  const fd = openSync(path, 'r');
  try {
    readSync(fd, buffer, 0, buffer.length, null);
  } finally {
    closeSync(fd);
  }
  return buffer.toString();
}

function tryReadHeadSync(path: string, length: number) {
  try {
    return readHeadSync(path, length);
  } catch (err: unknown) {
    if (!isErrnoException(err) || err.code !== 'ENOENT') {
      throw err;
    }
  }
}

const VARIABLES_TO_IGNORE = [
  'VERCEL_ANALYTICS_ID',
  'VERCEL_SPEED_INSIGHTS_ID',
  'VERCEL_WEB_ANALYTICS_ID',
];

export default async function pull(
  client: Client,
  argv: string[],
  source: EnvRecordsSource = 'vercel-cli:env:pull'
) {
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
  const skipConfirmation = opts['--yes'];
  const gitBranch = opts['--git-branch'];

  telemetryClient.trackCliArgumentFilename(args[0]);
  telemetryClient.trackCliFlagYes(skipConfirmation);
  telemetryClient.trackCliOptionGitBranch(gitBranch);
  telemetryClient.trackCliOptionEnvironment(opts['--environment']);

  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    if (client.nonInteractive) {
      const preserved = getPreservedArgsForEnvPull(client.argv);
      const linkArgv = [
        ...client.argv.slice(0, 2),
        'link',
        '--scope',
        '<scope>',
        ...preserved,
      ];
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'not_linked',
          message: `Your codebase isn't linked to a project on Vercel. Run ${getCommandNamePlain(
            'link'
          )} to begin. Use --yes for non-interactive; use --scope or --project to specify team or project.`,
          next: [
            { command: buildCommandWithYes(linkArgv) },
            { command: buildCommandWithYes(client.argv) },
          ],
        },
        1
      );
    }
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
    !!skipConfirmation,
    environment,
    link,
    gitBranch,
    client.cwd,
    source
  );

  return 0;
}

export async function envPullCommandLogic(
  client: Client,
  filename: string,
  skipConfirmation: boolean,
  environment: string,
  link: ProjectLinked,
  gitBranch: string | undefined,
  cwd: string,
  source: EnvRecordsSource
) {
  const fullPath = resolve(cwd, filename);
  const head = tryReadHeadSync(fullPath, Buffer.byteLength(CONTENTS_PREFIX));
  const exists = typeof head !== 'undefined';
  const requiresConfirmation =
    exists &&
    head !== CONTENTS_PREFIX &&
    !skipConfirmation &&
    !client.nonInteractive;

  if (head === CONTENTS_PREFIX) {
    output.log(`Overwriting existing ${chalk.bold(filename)} file`);
  } else if (exists && !skipConfirmation && client.nonInteractive) {
    outputActionRequired(client, {
      status: 'action_required',
      reason: 'env_file_exists',
      message: `File ${param(filename)} already exists and was not created by Vercel CLI. Use --yes to apply the downloaded changes or specify a different filename.`,
      next: [
        {
          command: getCommandNamePlain(`env pull ${filename} --yes`),
          when: 'Apply the downloaded changes to this file',
        },
        {
          command: getCommandNamePlain('env pull <filename>'),
          when: 'Use a different filename',
        },
      ],
    });
    return;
  }

  const projectSlugLink = formatProject(link.org.slug, link.project.name);

  const downloadMessage = gitBranch
    ? `Downloading \`${chalk.cyan(
        environment
      )}\` Environment Variables for ${projectSlugLink} and any overrides for branch ${chalk.cyan(
        gitBranch
      )}`
    : `Downloading \`${chalk.cyan(
        environment
      )}\` Environment Variables for ${projectSlugLink}`;

  output.log(downloadMessage);

  const pullStamp = stamp();
  output.spinner('Downloading');

  const records = (
    await pullEnvRecords(client, link.project.id, source, {
      target: environment || 'development',
      gitBranch,
    })
  ).env;

  let deltaString = '';
  let oldEnv;
  const downloadedEnv = getDownloadedEnv(records);

  if (exists) {
    oldEnv = await createEnvObject(fullPath);
  }

  const envToWrite = oldEnv
    ? {
        ...oldEnv,
        ...downloadedEnv,
      }
    : downloadedEnv;
  const comparableEnvToWrite = getComparableEnv(envToWrite);

  if (oldEnv) {
    deltaString = buildDeltaString(oldEnv, comparableEnvToWrite);
  }

  if (deltaString) {
    output.print('\n' + deltaString);
  } else if (oldEnv && exists) {
    output.log('No changes found.');
    if (head !== CONTENTS_PREFIX) {
      return;
    }
  }

  if (
    requiresConfirmation &&
    deltaString !== '' &&
    !(await client.input.confirm(
      `Apply these changes to ${param(filename)}?`,
      false
    ))
  ) {
    output.log('Canceled');
    return;
  }

  const contents =
    CONTENTS_PREFIX +
    Object.keys(envToWrite)
      .sort()
      .map(key => `${key}="${escapeValue(envToWrite[key])}"`)
      .join('\n') +
    '\n';

  await outputFile(fullPath, contents, 'utf8');

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

function escapeValue(value: string | undefined) {
  return value
    ? value
        .replace(new RegExp('\n', 'g'), '\\n') // combine newlines (unix) into one line
        .replace(new RegExp('\r', 'g'), '\\r') // combine newlines (windows) into one line
    : '';
}

function getDownloadedEnv(records: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(records).filter(
      ([key]) => !VARIABLES_TO_IGNORE.includes(key)
    )
  ) as Record<string, string | undefined>;
}

function getComparableEnv(env: Record<string, string | undefined>) {
  // Removes any double quotes from values, if they exist.
  // We need this because double quotes are stripped from parsed local env
  // files (by createEnvObject), so we strip them here too to ensure
  // comparisons reflect what the local parser sees.
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [key, value?.replace(/"/g, '')])
  ) as Record<string, string | undefined>;
}
