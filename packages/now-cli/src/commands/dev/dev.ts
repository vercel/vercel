import { resolve, join } from 'path';

import DevServer from '../../util/dev/server';
import parseListen from '../../util/dev/parse-listen';
import { Output } from '../../util/output';
import { NowContext, ProjectEnvVariable } from '../../types';
import Client from '../../util/client';
import { getLinkedProject } from '../../util/projects/link';
import { getFrameworks } from '../../util/get-frameworks';
import { isSettingValue } from '../../util/is-setting-value';
import { ProjectSettings, ProjectEnvTarget } from '../../types';
import getDecryptedEnvRecords from '../../util/get-decrypted-env-records';
import { Env } from '@vercel/build-utils';
import setupAndLink from '../../util/link/setup-and-link';
import getEnvVariables from '../../util/env/get-env-records';
import getSystemEnvValues from '../../util/env/get-system-env-values';

type Options = {
  '--debug'?: boolean;
  '--listen'?: string;
  '--confirm': boolean;
};

export default async function dev(
  ctx: NowContext,
  opts: Options,
  args: string[],
  output: Output
) {
  const [dir = '.'] = args;
  let cwd = resolve(dir);
  const listen = parseListen(opts['--listen'] || '3000');
  const debug = opts['--debug'] || false;

  const client = new Client({
    apiUrl: ctx.apiUrl,
    token: ctx.authConfig.token,
    currentTeam: ctx.config.currentTeam,
    debug,
  });

  // retrieve dev command
  let [link, frameworks] = await Promise.all([
    getLinkedProject(output, client, cwd),
    getFrameworks(client),
  ]);

  if (link.status === 'not_linked' && !process.env.__VERCEL_SKIP_DEV_CMD) {
    const autoConfirm = opts['--confirm'];
    const forceDelete = false;

    link = await setupAndLink(
      ctx,
      output,
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
  let environmentVars: Env | undefined;
  let systemEnvValues: string[] = [];
  if (link.status === 'linked') {
    const { project, org } = link;
    client.currentTeam = org.type === 'team' ? org.id : undefined;

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

    ({ envs: projectEnvs } = await getEnvVariables(
      output,
      client,
      project.id,
      ProjectEnvTarget.Development
    ));

    [environmentVars, { systemEnvValues }] = await Promise.all([
      getDecryptedEnvRecords(output, client, projectEnvs),
      getSystemEnvValues(output, client, project.id),
    ]);
  }

  const devServer = new DevServer(cwd, {
    output,
    debug,
    devCommand,
    frameworkSlug,
    projectSettings,
    environmentVars,
    projectEnvs,
    systemEnvValues,
  });

  process.once('SIGINT', () => devServer.stop());
  process.once('SIGTERM', () => devServer.stop());

  await devServer.start(...listen);
}
