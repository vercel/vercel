import chalk from 'chalk';
import { outputFile } from 'fs-extra';
import { closeSync, openSync, readSync } from 'fs';
import { resolve } from 'path';
import type {
  Project,
  ProjectEnvTarget,
  ProjectLinked,
} from '@vercel-internals/types';
import Client from '../../util/client';
import { emoji, prependEmoji } from '../../util/emoji';
import confirm from '../../util/input/confirm';
import { Output } from '../../util/output';
import param from '../../util/output/param';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';
import {
  EnvRecordsSource,
  pullEnvRecords,
} from '../../util/env/get-env-records';
import {
  buildDeltaString,
  createEnvObject,
} from '../../util/env/diff-env-files';
import { isErrnoException } from '@vercel/error-utils';
import { addToGitIgnore } from '../../util/link/add-to-gitignore';
import JSONparse from 'json-parse-better-errors';

const CONTENTS_PREFIX = '# Created by Vercel CLI\n';

type Options = {
  '--debug': boolean;
  '--yes': boolean;
  '--git-branch': string;
};

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

export default async function pull(
  client: Client,
  link: ProjectLinked,
  project: Project,
  environment: ProjectEnvTarget,
  opts: Partial<Options>,
  args: string[],
  output: Output,
  cwd: string,
  source: Extract<EnvRecordsSource, 'vercel-cli:env:pull' | 'vercel-cli:pull'>
) {
  if (args.length > 1) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(`env pull <file>`)}`
    );
    return 1;
  }

  // handle relative or absolute filename
  const [filename = '.env.local'] = args;
  const fullPath = resolve(cwd, filename);
  const skipConfirmation = opts['--yes'];
  const gitBranch = opts['--git-branch'];

  const head = tryReadHeadSync(fullPath, Buffer.byteLength(CONTENTS_PREFIX));
  const exists = typeof head !== 'undefined';

  if (head === CONTENTS_PREFIX) {
    output.log(`Overwriting existing ${chalk.bold(filename)} file`);
  } else if (
    exists &&
    !skipConfirmation &&
    !(await confirm(
      client,
      `Found existing file ${param(filename)}. Do you want to overwrite?`,
      false
    ))
  ) {
    output.log('Canceled');
    return 0;
  }

  output.log(
    `Downloading \`${chalk.cyan(
      environment
    )}\` Environment Variables for Project ${chalk.bold(project.name)}`
  );

  const pullStamp = stamp();
  output.spinner('Downloading');

  const records = (
    await pullEnvRecords(output, client, project.id, source, {
      target: environment || 'development',
      gitBranch,
    })
  ).env;

  let deltaString = '';
  let oldEnv;
  if (exists) {
    oldEnv = await createEnvObject(fullPath, output);
    if (oldEnv) {
      // Removes any double quotes from `records`, if they exist
      // We need this because double quotes are stripped from the local .env file,
      // but `records` is already in the form of a JSON object that doesn't filter
      // double quotes.
      const newEnv = JSONparse(JSON.stringify(records).replace(/\\"/g, ''));
      deltaString = buildDeltaString(oldEnv, newEnv);
    }
  }

  const contents =
    CONTENTS_PREFIX +
    Object.keys(records)
      .sort()
      .map(key => `${key}="${escapeValue(records[key])}"`)
      .join('\n') +
    '\n';

  await outputFile(fullPath, contents, 'utf8');

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

  return 0;
}

function escapeValue(value: string | undefined) {
  return value
    ? value
        .replace(new RegExp('\n', 'g'), '\\n') // combine newlines (unix) into one line
        .replace(new RegExp('\r', 'g'), '\\r') // combine newlines (windows) into one line
    : '';
}
