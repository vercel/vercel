import { join } from 'path';
import { exists } from 'fs-extra';
import { Config } from '../types';
import { Package } from './dev/types';
import { CantParseJSONFile } from './errors-ts';

import cmd from './output/cmd';
import link from './output/link';
import highlight from './output/highlight';

export async function hasDockerfile(cwd: string) {
  return new Promise(res => exists(join(cwd, 'Dockerfile'), res));
}

export async function hasServerfile(cwd: string) {
  return new Promise(res => exists(join(cwd, 'server.js'), res));
}

const INFO = `More: ${link('https://zeit.co/docs/version-detection')}`;

export default async function preferV2Deployment({
  hasDockerfile,
  hasServerfile,
  pkg,
  localConfig
}: {
  hasDockerfile: boolean,
  hasServerfile: boolean,
  pkg: Package | CantParseJSONFile | null,
  localConfig: Config | undefined
}): Promise<null | string> {
  if (localConfig && localConfig.version) {
    // We will prefer anything that is set here
    return null;
  }

  if (localConfig && localConfig.type) {
    return null;
  }

  if (hasServerfile) {
    return null;
  }

  if (pkg && !(pkg instanceof Error) && !hasDockerfile) {
    const { scripts = {} } = pkg;

    if (!scripts.start && !scripts['now-start']) {
      return `Deploying to Now 2.0, because ${highlight('package.json')} is missing a ${cmd('start')} script. ${INFO}`;
    }
  } else if (!pkg && !hasDockerfile) {
    return `Deploying to Now 2.0, because no ${highlight('Dockerfile')} was found. ${INFO}`;
  }

  return null;
}
