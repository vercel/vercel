import chalk from 'chalk';
import { join } from 'path';
import Client from '../util/client';
import getArgs from '../util/get-args';
import { getFrameworks } from '../util/get-frameworks';
import handleError from '../util/handle-error';
import { isSettingValue } from '../util/is-setting-value';
import setupAndLink from '../util/link/setup-and-link';
import logo from '../util/output/logo';
import { getPkgName } from '../util/pkg-name';
import { getLinkedProject } from '../util/projects/link';
import { writeProjectSettings } from '../util/projects/project-settings';
import pull from './env/pull';

const help = () => {
  return console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} pull`)} [filename]

 ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.vercel`'} directory
    -d, --debug                    Debug mode [off]

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Pull the latest Project Settings from the cloud

    ${chalk.cyan(`$ ${getPkgName()} pull`)}
`);
};
export default async function main(client: Client) {
  let argv;
  try {
    argv = getArgs(client.argv.slice(2), {
      '--yes': Boolean,
      '--env': String,
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

  const cwd = argv._[1] || process.cwd();
  const debug = argv['--debug'];
  const yes = argv['--yes'];
  const env = argv['--env'] ?? '.env';
  let [link, frameworks] = await Promise.all([
    await getLinkedProject(client, cwd),
    await getFrameworks(client),
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

  const { project, org } = link;
  const result = await pull(
    client,
    project,
    { '--yes': yes, '--debug': debug },
    [join(cwd, env)],
    client.output
  );
  if (result !== 0) {
    // an error happened
    return result;
  }
  let devCommand = project.devCommand;
  let buildCommand = project.buildCommand;
  let frameworkSlug = project.framework;
  if (!devCommand && project.framework) {
    const framework = frameworks.find(f => f.slug === project.framework);

    if (framework) {
      if (framework.slug) {
        frameworkSlug = framework.slug;
      }

      const defaults = framework.settings.devCommand;
      if (isSettingValue(defaults)) {
        devCommand = defaults.value;
      }
    }
  }

  if (!buildCommand && project.framework) {
    const framework = frameworks.find(f => f.slug === project.framework);

    if (framework) {
      if (framework.slug) {
        frameworkSlug = framework.slug;
      }

      const defaults = framework.settings.buildCommand;
      if (isSettingValue(defaults)) {
        buildCommand = defaults.value;
      }
    }
  }

  const normalizedProject = {
    ...project,
    buildCommand,
    devCommand,
    framework: frameworkSlug,
  };

  await writeProjectSettings(cwd, normalizedProject, org);

  return 0;
}
