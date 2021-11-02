import { join, resolve } from 'path';
import Client from '../../util/client';
import parseListen from '../../util/dev/parse-listen';
import DevServer from '../../util/dev/server';
import confirm from '../../util/input/confirm';
import { isSettingValue } from '../../util/is-setting-value';
import { getCommandName } from '../../util/pkg-name';
import { findFramework } from '../../util/projects/find-framework';
import { VERCEL_DIR } from '../../util/projects/link';
import { readProjectSettings } from '../../util/projects/project-settings';
import pull from '../pull';

type Options = {
  '--listen': string;
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

  let project = await readProjectSettings(join(cwd, VERCEL_DIR));
  // If there are no project settings, only then do we pull them down
  while (!project?.settings && !process.env.__VERCEL_SKIP_DEV_CMD) {
    const confirmed = await confirm(
      `No Project Settings found locally. Run ${getCommandName(
        'pull'
      )} for retrieving them?`,
      true
    );
    if (!confirmed) {
      client.output.print(`Aborted. No Project Settings retrieved.\n`);
      return 0;
    }
    const result = await pull(client);
    if (result !== 0) {
      return result;
    }
    project = await readProjectSettings(join(cwd, VERCEL_DIR));
  }

  cwd = project?.settings.rootDirectory
    ? join(cwd, project.settings.rootDirectory)
    : cwd;

  process.chdir(cwd);

  const framework = findFramework(project?.settings.framework);
  // If this is undefined, we bail. If it is null, then findFramework should return "Other",
  // so this should really never happen, but just in case....
  if (framework === undefined && !process.env.__VERCEL_SKIP_DEV_CMD) {
    client.output.error(
      `Framework detection failed or is malformed. Please run ${getCommandName(
        'pull'
      )} again.`
    );
    return 1;
  }

  const devCommand = project?.settings.devCommand
    ? project.settings.devCommand
    : framework?.settings.devCommand
    ? isSettingValue(framework.settings.devCommand)
      ? framework.settings.devCommand?.value
      : undefined
    : undefined;

  const devServer = new DevServer(cwd, {
    output,
    devCommand,
    frameworkSlug: project?.settings.framework ?? undefined,
    projectSettings: project?.settings,
    projectEnvs: [],
    systemEnvValues: [],
  });

  await devServer.start(...listen);
}
