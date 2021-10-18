import { loadEnvConfig } from '@next/env';
import { execCommand, runPackageJsonScript } from '@vercel/build-utils';
import { join } from 'path';
import Client from '../util/client';
import getArgs from '../util/get-args';
import handleError from '../util/handle-error';
import { readProjectSettings } from '../util/projects/project-settings';
import pull from './pull';

const help = () => {
  // @todo help output
  return console.log('vercel build');
};

export default async function main(client: Client) {
  let argv;
  try {
    argv = getArgs(client.argv.slice(2));
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }

  let cwd = argv._[1] || process.cwd();
  let project = await readProjectSettings(cwd);
  // If there are no project settings, only then do we pull them down
  while (project === null) {
    const result = await pull(client);
    if (result !== 0) {
      return result;
    }
    project = await readProjectSettings(cwd);
  }

  if (project.settings.rootDirectory) {
    cwd = join(cwd, project.settings.rootDirectory);
    client.output.debug(
      `Found custom root directory: ${project.settings.rootDirectory}`
    );
  }

  const buildCommand = project.settings.buildCommand;
  const { combinedEnv, loadedEnvFiles } = await loadEnvConfig(cwd, false);
  if (loadedEnvFiles.length > 0) {
    client.output.debug(`Found ${loadedEnvFiles.length} .env files:`);
    for (let f of loadedEnvFiles) {
      client.output.debug(`- ${f.path}`);
    }
  }

  const spawnOpts = {
    env: combinedEnv,
  };

  let result: boolean;
  if (typeof buildCommand === 'string') {
    client.output.debug(`Found custom build command: ${buildCommand}`);
    result = await execCommand(buildCommand, {
      ...spawnOpts,
      // Yarn v2 PnP mode may be activated, so force
      // "node-modules" linker style
      env: {
        YARN_NODE_LINKER: 'node-modules',
        ...spawnOpts.env,
      },
      cwd: cwd,
    });
  } else {
    result = await runPackageJsonScript(
      cwd,
      ['vercel-build', 'now-build', 'build'],
      spawnOpts
    );
  }

  if (!result) {
    client.output.error(
      `Missing required "${buildCommand || 'vercel-build'}" script in "${cwd}"`
    );
  }

  // Plugins

  return 0;
}
