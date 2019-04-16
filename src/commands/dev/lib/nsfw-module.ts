import { tmpdir } from 'os';
import { pathExists, mkdirp, createWriteStream } from 'fs-extra';
import { join } from 'path';
import fetch from 'node-fetch';
import { devDependencies } from '../../../../package.json';
import { Output } from '../../../util/output/create-output';

const platformToName = {
  alpine: 'nsfw-alpine',
  darwin: 'nsfw-macos',
  linux: 'nsfw-linux'
};

const { platform } = process;
const name = platformToName[platform];

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
