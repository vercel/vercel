import execa from 'execa';
import { tmpdir } from 'os';
import {
  pathExists,
  mkdirp,
  createWriteStream,
  statSync,
  chmodSync
} from 'fs-extra';
import pipe from 'promisepipe';
import { join } from 'path';
import fetch from 'node-fetch';
import tar from 'tar-fs';
import { setScriptGlobals } from '@now/build-utils';
import { Output } from '../../../util/output/create-output';

async function isFoundInPath(): Promise<boolean> {
  const [npm, yarn] = await Promise.all([
    execa('npm', ['--version']),
    execa('yarn', ['--version'])
  ]);
  return typeof npm === 'string' || typeof yarn === 'string';
}

async function installYarn(output: Output): Promise<string> {
  // Loosely based on https://yarnpkg.com/install.sh
  const dirName = join(tmpdir(), 'co.zeit.now', 'dev', 'yarn');
  // const full = join(dirName, 'yarn-latest.tar.gz');
  const yarnBin = join(dirName, 'bin', 'yarn');

  if (await pathExists(yarnBin)) {
    output.debug('The yarn module is already cached, not re-downloading');
    return yarnBin;
  }

  output.debug(`Creating directory ${dirName}`);
  await mkdirp(dirName);
  output.debug(`Finished creating ${dirName}`);

  const url = 'https://yarnpkg.com/latest.tar.gz';

  output.debug(`Downloading ${url}`);
  const response = await fetch(url, { compress: false, redirect: 'follow' });

  if (response.status !== 200) {
    throw new Error(`Received invalid response: ${await response.text()}`);
  }
  /*
  const target = createWriteStream(full);
  await pipe(response.body, target);
  output.debug(`Finished downloading ${url}`);
  */

  await new Promise((resolve, reject) => {
    const extractor = tar.extract(dirName);
    response.body.on('error', reject);
    extractor.on('error', reject);
    extractor.on('finish', resolve);
    response.body.pipe(extractor);
  });

  return yarnBin;
}

export async function initYarn(output: Output): Promise<void> {
  const found = await isFoundInPath();
  if (!found) {
    const yarnBin = await installYarn(output);
    setScriptGlobals({ yarnBin });
  }
}
