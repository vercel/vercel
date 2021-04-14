import { resolve, join } from 'path';

import DevServer from '../../util/dev/server';
import parseListen from '../../util/dev/parse-listen';
import { ProjectEnvVariable } from '../../types';
import Client from '../../util/client';
import { getLinkedProject } from '../../util/projects/link';
import { getFrameworks } from '../../util/get-frameworks';
import { isSettingValue } from '../../util/is-setting-value';
import { ProjectSettings } from '../../types';
import getDecryptedEnvRecords from '../../util/get-decrypted-env-records';
import setupAndLink from '../../util/link/setup-and-link';
import getSystemEnvValues from '../../util/env/get-system-env-values';

type Options = {
  '--debug'?: boolean;
  '--listen'?: string;
  '--confirm': boolean;
};

export default async function dev(
  client: Client,
  opts: Partial<Options>,
  args: string[]
) {
  const { output } = client;
  const [dir = '.'] = args;
  let cwd = resolve(dir);
  const listen = parseListen(opts['--listen'] || '3000');
  const debug = opts['--debug'] || false;

  // retrieve dev command
  let [link, frameworks] = await Promise.all([
    getLinkedProject(client, cwd),
    getFrameworks(client),
  ]);

  if (link.status === 'not_linked' && !process.env.__VERCEL_SKIP_DEV_CMD) {
    const autoConfirm = opts['--confirm'] || false;
    const forceDelete = false;

    link = await setupAndLink(
      client,
      cwd,
      forceDelete,
      autoConfirm,
      'link',
      'Set up and develop'
    );

    if (link.status === 'not_linked') {
      // User aborted project linking questions
      return 0;
    }
  }

  if (link.status === 'error') {
    return link.exitCode;
  }

  let devCommand: string | undefined;
  let frameworkSlug: string | undefined;
  let projectSettings: ProjectSettings | undefined;
  let projectEnvs: ProjectEnvVariable[] = [];
  let systemEnvValues: string[] = [];
  if (link.status === 'linked') {
    const { project, org } = link;
    client.config.currentTeam = org.type === 'team' ? org.id : undefined;

    projectSettings = project;

    if (project.devCommand) {
      devCommand = project.devCommand;
    } else if (project.framework) {
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

    if (project.rootDirectory) {
      cwd = join(cwd, project.rootDirectory);
    }

    [{ envs: projectEnvs }, { systemEnvValues }] = await Promise.all([
      getDecryptedEnvRecords(output, client, project.id),
      project.autoExposeSystemEnvs
        ? getSystemEnvValues(output, client, project.id)
        : { systemEnvValues: [] },
    ]);
  }

  const devServer = new DevServer(cwd, {
    output,
    debug,
    devCommand,
    frameworkSlug,
    projectSettings,
    projectEnvs,
    systemEnvValues,
  });

  process.once('SIGINT', () => devServer.stop());
  process.once('SIGTERM', () => devServer.stop());

  await devServer.start(...listen);
}
