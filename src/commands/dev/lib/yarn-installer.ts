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
import { dirname, join } from 'path';
import fetch from 'node-fetch';
import { Output } from '../../../util/output/create-output';
import { builderDirPromise } from './builder-cache';

const YARN_VERSION = '1.15.2';
const YARN_SHA = '97efd1871117e60c24f157289d61a7595e142070';
const YARN_URL = `https://github.com/yarnpkg/yarn/releases/download/v${YARN_VERSION}/yarn-${YARN_VERSION}.js`;

function plusxSync(file: string): void {
  const s = statSync(file);
  const newMode = s.mode | 64 | 8 | 1;

  if (s.mode === newMode) {
    return;
  }

  const base8 = newMode.toString(8).slice(-3);
  chmodSync(file, base8);
}

function getSha1(filePath: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha1');
    const stream = createReadStream(filePath);
    stream.on('error', (err) => {
      if (err.code === 'ENOENT') {
        resolve(null);
      } else {
        reject(err);
      }
    });
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function installYarn(output: Output): Promise<string> {
  // Loosely based on https://yarnpkg.com/install.sh
  const dirName = await builderDirPromise;
  const yarnBin = join(dirName, 'yarn');
  const sha1 = await getSha1(yarnBin);

  if (sha1 === YARN_SHA) {
    output.debug('The yarn executable is already cached, not re-downloading');
    return dirName;
  }

  output.debug(`Creating directory ${dirName}`);
  await mkdirp(dirName);
  output.debug(`Finished creating ${dirName}`);

  output.debug(`Downloading ${YARN_URL}`);
  const response = await fetch(YARN_URL, { compress: false, redirect: 'follow' });

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

export async function getYarnPath(output: Output): Promise<string> {
  return installYarn(output);
}
