import { resolve, join } from 'path';
import fs from 'fs-extra';

import DevServer from '../../util/dev/server';
import parseListen from '../../util/dev/parse-listen';
import { ProjectEnvVariable } from '../../types';
import Client from '../../util/client';
import { getLinkedProject } from '../../util/projects/link';
import { getFrameworks } from '../../util/get-frameworks';
import { ProjectSettings } from '../../types';
import getDecryptedEnvRecords from '../../util/get-decrypted-env-records';
import setupAndLink from '../../util/link/setup-and-link';
import getSystemEnvValues from '../../util/env/get-system-env-values';
import { getCommandName } from '../../util/pkg-name';
import param from '../../util/output/param';
import { OUTPUT_DIR } from '../../util/build/write-build-result';

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

  // retrieve dev command
  let [link, frameworks] = await Promise.all([
    getLinkedProject(client, cwd),
    getFrameworks(client),
  ]);

  if (link.status === 'not_linked' && !process.env.__VERCEL_SKIP_DEV_CMD) {
    link = await setupAndLink(client, cwd, {
      autoConfirm: opts['--confirm'],
      successEmoji: 'link',
      setupMsg: 'Set up and develop',
    });

    if (link.status === 'not_linked') {
      // User aborted project linking questions
      return 0;
    }
  }

  if (link.status === 'error') {
    if (link.reason === 'HEADLESS') {
      client.output.error(
        `Command ${getCommandName(
          'dev'
        )} requires confirmation. Use option ${param('--confirm')} to confirm.`
      );
    }
    return link.exitCode;
  }

  let devCommand: string | undefined;
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
        const defaults = framework.settings.devCommand.value;
        if (defaults) {
          devCommand = defaults;
        }
      }
    }

    if (project.rootDirectory) {
      cwd = join(cwd, project.rootDirectory);
    }

    [{ envs: projectEnvs }, { systemEnvValues }] = await Promise.all([
      getDecryptedEnvRecords(output, client, project.id, 'vercel-cli:dev'),
      project.autoExposeSystemEnvs
        ? getSystemEnvValues(output, client, project.id)
        : { systemEnvValues: [] },
    ]);
  }

  // This is just for tests - can be removed once project settings
  // are respected locally in `.vercel/project.json`
  if (process.env.VERCEL_DEV_COMMAND) {
    devCommand = process.env.VERCEL_DEV_COMMAND;
  }

  // If there is no Development Command, we must delete the
  // v3 Build Output because it will incorrectly be detected by
  // @vercel/static-build in BuildOutputV3.getBuildOutputDirectory()
  if (!devCommand) {
    const outputDir = join(cwd, OUTPUT_DIR);
    if (await fs.pathExists(outputDir)) {
      output.log(`Removing ${OUTPUT_DIR}`);
      await fs.remove(outputDir);
    }
  }

  const devServer = new DevServer(cwd, {
    output,
    devCommand,
    projectSettings,
    projectEnvs,
    systemEnvValues,
  });

  await devServer.start(...listen);
}
