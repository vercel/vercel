import chalk from 'chalk';
import { Project } from '../../types';
import { Output } from '../../util/output';
import confirm from '../../util/input/confirm';
import Client from '../../util/client';
import stamp from '../../util/output/stamp';
import getDecryptedEnvRecords from '../../util/get-decrypted-env-records';
import param from '../../util/output/param';
import withSpinner from '../../util/with-spinner';
import { join } from 'path';
import { promises, openSync, closeSync, readSync } from 'fs';
import { emoji, prependEmoji } from '../../util/emoji';
import { getCommandName } from '../../util/pkg-name';
const { writeFile } = promises;
import exposeSystemEnvs from '../../util/dev/expose-system-envs';
import getSystemEnvValues from '../../util/env/get-system-env-values';

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
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

export default async function pull(
  client: Client,
  project: Project,
  opts: Options,
  args: string[],
  output: Output
) {
  if (args.length > 1) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(`env pull <file>`)}`
    );
    return 1;
  }

  const [filename = '.env'] = args;
  const fullPath = join(process.cwd(), filename);
  const skipConfirmation = opts['--yes'];

  const head = tryReadHeadSync(fullPath, Buffer.byteLength(CONTENTS_PREFIX));
  const exists = typeof head !== 'undefined';

  if (head === CONTENTS_PREFIX) {
    output.print(`Overwriting existing ${chalk.bold(filename)} file\n`);
  } else if (
    exists &&
    !skipConfirmation &&
    !(await confirm(
      `Found existing file ${param(filename)}. Do you want to overwrite?`,
      false
    ))
  ) {
    output.log('Aborted');
    return 0;
  }

  output.print(
    `Downloading Development Environment Variables for Project ${chalk.bold(
      project.name
    )}\n`
  );
  const pullStamp = stamp();

  const [
    { envs: projectEnvs },
    { systemEnvValues },
  ] = await withSpinner('Downloading', () =>
    Promise.all([
      getDecryptedEnvRecords(output, client, project.id),
      project.autoExposeSystemEnvs
        ? getSystemEnvValues(output, client, project.id)
        : { systemEnvValues: [] },
    ])
  );

  const records = exposeSystemEnvs(
    projectEnvs,
    systemEnvValues,
    project.autoExposeSystemEnvs
  );

  const contents =
    CONTENTS_PREFIX +
    Object.entries(records)
      .map(([key, value]) => `${key}="${escapeValue(value)}"`)
      .join('\n') +
    '\n';

  await writeFile(fullPath, contents, 'utf8');

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
