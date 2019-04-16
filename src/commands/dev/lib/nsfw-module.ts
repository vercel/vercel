import { tmpdir } from 'os';
import { pathExists, mkdirp, createWriteStream, statSync, chmodSync } from 'fs-extra';
import { join } from 'path';
import fetch from 'node-fetch';
import { spawnSync } from 'child_process';
import { devDependencies } from '../../../../package.json';
import { Output } from '../../../util/output/create-output';

const platformToName: { [name: string]: string } = {
  alpine: 'nsfw-alpine',
  darwin: 'nsfw-macos',
  linux: 'nsfw-linux'
};

// @ts-ignore
let { platform } = process;

const detectAlpine = () => {
  if (platform !== 'linux') {
    return false;
  }

  // https://github.com/sass/node-sass/issues/1589#issuecomment-265292579
  const ldd = spawnSync('ldd', [process.execPath]).stdout.toString();

  return /\bmusl\b/.test(ldd);
};

if (detectAlpine()) {
  // @ts-ignore
  platform = 'alpine';
}

const name = platformToName[platform];

const plusxSync = (file: string): void => {
  const s = statSync(file);
  const newMode = s.mode | 64 | 8 | 1;

  if (s.mode === newMode) {
    return;
  }

  const base8 = newMode.toString(8).slice(-3);
  chmodSync(file, base8);
};

const prepareModule = async (): Promise<string> =>  {
  const version = devDependencies['@zeit/nsfw'];
  const fileName = `nsfw-${version}.node`;
  const dirName = join(tmpdir(), 'co.zeit.now', 'dev');
  const full = join(dirName, fileName);

  if (await pathExists(full)) {
    return full;
  }

  await mkdirp(dirName);

  const url = `https://github.com/zeit/nsfw/releases/download/${version}/${name}.node`;
  const response = await fetch(url, { compress: false });

  if (response.status !== 200) {
    throw new Error(`Received invalid response: ${await response.text()}`);
  }

  const target = createWriteStream(full);
  response.body.pipe(target);

  // Make the binary executable
  plusxSync(full);

  return full;
};

export default async (output: Output): Promise<string|undefined> => {
  let modulePath = null;

  try {
    modulePath = await prepareModule();
  } catch (err) {
    output.error('Failed to prepare file watcher. Please try again.');
    output.debug(err);

    process.exit(1);

    return;
  }

  return modulePath;
};
