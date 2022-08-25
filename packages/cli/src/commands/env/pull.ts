import chalk from 'chalk';
import { outputFile } from 'fs-extra';
import { closeSync, openSync, readSync } from 'fs';
import { resolve } from 'path';
import { Project, ProjectEnvTarget } from '../../types';
import Client from '../../util/client';
import exposeSystemEnvs from '../../util/dev/expose-system-envs';
import { emoji, prependEmoji } from '../../util/emoji';
import getSystemEnvValues from '../../util/env/get-system-env-values';
import getDecryptedEnvRecords from '../../util/get-decrypted-env-records';
import confirm from '../../util/input/confirm';
import { Output } from '../../util/output';
import param from '../../util/output/param';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';
import { EnvRecordsSource } from '../../util/env/get-env-records';
import {
  buildDeltaString,
  createEnvObject,
} from '../../util/env/diff-env-files';
import { isErrnoException } from '../../util/is-error';

const CONTENTS_PREFIX = '# Created by Vercel CLI\n';

type Options = {
  '--debug': boolean;
  '--yes': boolean;
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
  const [filename = '.env'] = args;
  const fullPath = resolve(cwd, filename);
  const skipConfirmation = opts['--yes'];

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

  const [{ envs: projectEnvs }, { systemEnvValues }] = await Promise.all([
    getDecryptedEnvRecords(output, client, project.id, source, environment),
    project.autoExposeSystemEnvs
      ? getSystemEnvValues(output, client, project.id)
      : { systemEnvValues: [] },
  ]);

  const records = exposeSystemEnvs(
    projectEnvs,
    systemEnvValues,
    project.autoExposeSystemEnvs,
    undefined,
    environment
  );

  let deltaString = '';
  let oldEnv;
  if (exists) {
    oldEnv = await createEnvObject(fullPath, output);
    if (oldEnv) {
      // Removes any double quotes from `records`, if they exist
      // We need this because double quotes are stripped from the local .env file,
      // but `records` is already in the form of a JSON object that doesn't filter
      // double quotes.
      const newEnv = JSON.parse(JSON.stringify(records).replace(/\\"/g, ''));
      deltaString = buildDeltaString(oldEnv, newEnv);
    }
  }

  const contents =
    CONTENTS_PREFIX +
    Object.entries(records)
      .map(([key, value]) => `${key}="${escapeValue(value)}"`)
      .join('\n') +
    '\n';

  await outputFile(fullPath, contents, 'utf8');

  if (deltaString) {
    output.print('\n' + deltaString);
  } else if (oldEnv && exists) {
    output.log('No changes found.');
  }

  output.print(
    `${prependEmoji(
      `${exists ? 'Updated' : 'Created'} ${chalk.bold(
        filename
      )} file ${chalk.gray(pullStamp())}`,
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
