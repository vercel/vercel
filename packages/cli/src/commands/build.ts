import { execCommand, runPackageJsonScript } from '@vercel/build-utils';
import { join } from 'path';
import Client from '../util/client';
import getArgs from '../util/get-args';
import handleError from '../util/handle-error';
import { getCommandName } from '../util/pkg-name';
import { readProjectSettings } from '../util/projects/project-settings';

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
  const project = await readProjectSettings(cwd);
  if (project === null) {
    client.output.error(
      `Project settings not found. Run ${getCommandName(
        'pull'
      )} and then try running ${getCommandName('build')} again.`
    );
    return 1;
  }

  if (project.settings.rootDirectory) {
    cwd = join(cwd, project.settings.rootDirectory);
    client.output.debug(
      `Found custom root directory: ${project.settings.rootDirectory}`
    );
  }

  const buildCommand = project.settings.buildCommand;
  const spawnOpts = {
    env: {}, // @todo what shouuld these be for build?
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
