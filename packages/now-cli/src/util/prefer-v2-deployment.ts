import { join } from 'path';
import { exists } from 'fs-extra';
import { PackageJson } from '@now/build-utils';

import Client from './client';
import { Config } from '../types';
import { CantParseJSONFile, ProjectNotFound } from './errors-ts';
import getProjectByIdOrName from './projects/get-project-by-id-or-name';

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
  client,
  hasDockerfile,
  hasServerfile,
  pkg,
  localConfig,
  projectName,
}: {
  client?: Client;
  hasDockerfile: boolean;
  hasServerfile: boolean;
  pkg: PackageJson | CantParseJSONFile | null;
  localConfig: Config | undefined;
  projectName?: string;
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
      return `Deploying to Now 2.0, because ${highlight(
        'package.json'
      )} is missing a ${cmd('start')} script. ${INFO}`;
    }
  } else if (!pkg && !hasDockerfile) {
    return `Deploying to Now 2.0 automatically. ${INFO}`;
  }

  if (client && projectName) {
    const project = await getProjectByIdOrName(client, projectName);

    if (project instanceof ProjectNotFound) {
      return `Deploying to Now 2.0, because this project does not yet exist. ${INFO}`;
    }

    if (project && project.createdAt > 1565186886910) {
      return `Deploying to Now 2.0, because this project was created on Now 2.0. ${INFO}`;
    }
  }

  return null;
}
