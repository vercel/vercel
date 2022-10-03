import { resolve, join } from 'path';
import fs from 'fs-extra';

import DevServer from '../../util/dev/server';
import { parseListen } from '../../util/dev/parse-listen';
import Client from '../../util/client';
import { OUTPUT_DIR } from '../../util/build/write-build-result';
import { ensureProjectSettings } from '../../util/pull/project-settings';

type Options = {
  '--listen': string;
  '--yes': boolean;
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

  // retrieve dev command
  const project = await ensureProjectSettings(
    client,
    cwd,
    'development',
    opts['--yes']
  );
  if (typeof project === 'number') {
    return project;
  }
  const { settings, orgId } = project;

  client.config.currentTeam = orgId.startsWith('team_') ? orgId : undefined;

  if (settings.rootDirectory) {
    cwd = join(cwd, settings.rootDirectory);
  }

  const devServer = new DevServer(cwd, {
    output,
    projectSettings: settings,
  });

  // If there is no Development Command, we must delete the
  // v3 Build Output because it will incorrectly be detected by
  // @vercel/static-build in BuildOutputV3.getBuildOutputDirectory()
  if (!devServer.devCommand) {
    const outputDir = join(cwd, OUTPUT_DIR);
    if (await fs.pathExists(outputDir)) {
      output.log(`Removing ${OUTPUT_DIR}`);
      await fs.remove(outputDir);
    }
  }

  await devServer.start(...listen);
}
