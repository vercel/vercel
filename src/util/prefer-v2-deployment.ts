import { join } from 'path';
import { exists } from 'fs-extra';
import { Config } from '../types';
import { Package } from './dev/types';
import {CantParseJSONFile } from './errors-ts';

import cmd from './output/cmd';
import code from './output/code';
import highlight from './output/highlight';

export async function hasDockerfile(cwd: string) {
  return new Promise(res => exists(join(cwd, 'Dockerfile'), res));
}

const PREFIX = `Changing platform version to ${code('2')}`;

export default async function preferV2Deployment({
  hasDockerfile,
  pkg,
  localConfig
}: {
  hasDockerfile: boolean,
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

  if (pkg && !(pkg instanceof Error) && !hasDockerfile) {
    const { scripts = {} } = pkg;

    if (!scripts.start && !scripts['now-start']) {
      return `${PREFIX}: ${highlight('package.json')} has no ${cmd('start')} script`;
    }
  } else if (!pkg && !hasDockerfile) {
    return `${PREFIX}: no ${highlight('Dockerfile')} found`;
  }

  return null;
}
