import { spawnCommand } from '@vercel/build-utils';
import { join } from 'path';
import Client from '../util/client';
import getArgs from '../util/get-args';
import { getFrameworks } from '../util/get-frameworks';
import handleError from '../util/handle-error';
import { isSettingValue } from '../util/is-setting-value';
import setupAndLink from '../util/link/setup-and-link';
import { getLinkedProject } from '../util/projects/link';

const help = () => {
  // @todo help output
  return 'vercel build';
};
export default async function main(client: Client) {
  let argv;
  let yes;
  try {
    argv = getArgs(client.argv.slice(2), {
      '--yes': Boolean,
      '-y': '--yes',
    });
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }
  let buildCommand: string | undefined;
  let frameworkSlug: string | undefined;
  let cwd = argv._[1] || process.cwd();
  yes = argv['--yes'];
  // retrieve dev command
  let [link, frameworks] = await Promise.all([
    getLinkedProject(client, cwd),
    getFrameworks(client),
  ]);
  if (link.status === 'not_linked') {
    link = await setupAndLink(client, cwd, {
      autoConfirm: yes,
      successEmoji: 'link',
      setupMsg: 'Set up',
    });

    if (link.status === 'not_linked') {
      // User aborted project linking questions
      return 0;
    }
  }

  if (link.status === 'error') {
    return link.exitCode;
  }

  if (link.status === 'linked') {
    const { project } = link;
    if (project.buildCommand) {
      buildCommand = project.buildCommand;
    } else if (project.framework) {
      const framework = frameworks.find(f => f.slug === project.framework);

      if (framework) {
        if (framework.slug) {
          frameworkSlug = framework.slug;
        }
        client.output.debug(`Framework Detected: ${frameworkSlug ?? 'Other'}`);

        const defaults = framework.settings.buildCommand;
        if (isSettingValue(defaults)) {
          buildCommand = defaults.value;
        }
      }
    }

    if (project.rootDirectory) {
      cwd = join(cwd, project.rootDirectory);
    }

    buildCommand = buildCommand || 'npm run vercel-build' || 'npm run build';

    client.output.debug(`Running build command: ${buildCommand}`);

    await spawnCommand(buildCommand, {
      cwd,
      env: {
        FORCE_COLOR: '1',
        // @TODO env vars??
      },
    });
  }

  return 0;
}
