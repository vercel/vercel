import { resolve, join } from 'path';

import DevServer from '../../util/dev/server';
import parseListen from '../../util/dev/parse-listen';
import { Output } from '../../util/output';
import { NowContext } from '../../types';
import Client from '../../util/client';
import { getLinkedProject } from '../../util/projects/link';
import { getFrameworks } from '../../util/get-frameworks';
import { isSettingValue } from '../../util/is-setting-value';
import { getCommandName } from '../../util/pkg-name';
import { ProjectSettings } from '../../types';

type Options = {
  '--debug'?: boolean;
  '--listen'?: string;
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
  const [link, frameworks] = await Promise.all([
    getLinkedProject(output, client, cwd),
    getFrameworks(client),
  ]);

  if (link.status === 'error') {
    return link.exitCode;
  }

  if (link.status === 'not_linked' && !process.env.__VERCEL_SKIP_DEV_CMD) {
    output.error(
      `Your codebase isn’t linked to a project on Vercel. Run ${getCommandName()} to link it.`
    );
    return 1;
  }

  let devCommand: string | undefined;
  let frameworkSlug: string | undefined;
  let projectSettings: ProjectSettings | undefined;
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
  }

  const devServer = new DevServer(cwd, {
    output,
    debug,
    devCommand,
    frameworkSlug,
    projectSettings,
  });

  process.once('SIGINT', () => devServer.stop());
  process.once('SIGTERM', () => devServer.stop());

  await devServer.start(client, link.project, ...listen);
}
