import execa from 'execa';
import { tmpdir } from 'os';
import { createHash } from 'crypto';
import {
  mkdirp,
  createWriteStream,
  statSync,
  chmodSync,
  createReadStream
} from 'fs-extra';
import pipe from 'promisepipe';
import { join } from 'path';
import fetch from 'node-fetch';
import { Output } from '../../../util/output/create-output';

async function isFoundInPath(output: Output): Promise<boolean> {
  try {
    await execa('yarn', ['--version']);
    output.debug('Found yarn in current path');
    return true;
  } catch (error) {
    output.debug('Did not find yarn in current path');
    return false;
  }
}

function plusxSync(file: string): void {
  const s = statSync(file);
  const newMode = s.mode | 64 | 8 | 1;

  if (s.mode === newMode) {
    return;
  }

  const base8 = newMode.toString(8).slice(-3);
  chmodSync(file, base8);
}

function getSha1(filePath: string) {
  return new Promise<string | Buffer>((resolve, reject) => {
    const hash = createHash('sha1').setEncoding('hex');
    const stream = createReadStream(filePath)
    .pipe(hash)
    .on('error', () => resolve('not found'))
    .on('finish', () => {
      const str = stream.read();
      resolve(str);
    });
  });

}

async function installYarn(output: Output): Promise<string> {
  // Loosely based on https://yarnpkg.com/install.sh
  const dirName = join(tmpdir(), 'co.zeit.now', 'dev', 'yarn');
  const yarnBin = join(dirName, 'yarn.js');
  const sha1 = await getSha1(yarnBin);

  if (sha1 === 'e7c1b06bc4dac907a7adba7240d5b569aed396326caa159d85a8ca26bc09d31f') {
    output.debug('The yarn executable is already downloaded');
    return dirName;
  }

  output.debug(`Creating directory ${dirName}`);
  await mkdirp(dirName);
  output.debug(`Finished creating ${dirName}`);

  const url = 'https://github.com/yarnpkg/yarn/releases/download/v1.15.2/yarn-1.15.2.js';

  output.debug(`Downloading ${url}`);
  const response = await fetch(url, { compress: false, redirect: 'follow' });

  if (response.status !== 200) {
    throw new Error(`Received invalid response: ${await response.text()}`);
  }

  const target = createWriteStream(yarnBin);
  await pipe(response.body, target);
  output.debug(`Finished downloading yarn ${yarnBin}`);

  output.debug(`Making the yarn binary executable`);
  plusxSync(yarnBin);
  output.debug(`Finished making the yarn binary executable`);

  return dirName;
}

export async function getYarnPath(output: Output): Promise<string | undefined> {
  const found = await isFoundInPath(output);
  if (found) {
    return;
  }
  const yarnPath = await installYarn(output);
  return yarnPath;
}
