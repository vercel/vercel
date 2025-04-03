import { resolve, join } from 'path';
import fs from 'fs-extra';

import DevServer from '../../util/dev/server';
import { parseListen } from '../../util/dev/parse-listen';
import type Client from '../../util/client';
import { getLinkedProject } from '../../util/projects/link';
import type { ProjectSettings } from '@vercel-internals/types';
import setupAndLink from '../../util/link/setup-and-link';
import { getCommandName } from '../../util/pkg-name';
import param from '../../util/output/param';
import { OUTPUT_DIR } from '../../util/build/write-build-result';
import { pullEnvRecords } from '../../util/env/get-env-records';
import { refreshOidcToken } from '../../util/env/refresh-oidc-token';
import output from '../../output-manager';

type Options = {
  '--listen': string;
  '--yes': boolean;
};

export default async function dev(
  client: Client,
  opts: Partial<Options>,
  args: string[]
) {
  const [dir = '.'] = args;
  let cwd = resolve(dir);
  const listen = parseListen(opts['--listen'] || '3000');

  // retrieve dev command
  let link = await getLinkedProject(client, cwd);

  if (link.status === 'not_linked' && !process.env.__VERCEL_SKIP_DEV_CMD) {
    link = await setupAndLink(client, cwd, {
      autoConfirm: opts['--yes'],
      link,
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
      output.error(
        `Command ${getCommandName(
          'dev'
        )} requires confirmation. Use option ${param('--yes')} to confirm.`
      );
    }
    return link.exitCode;
  }

  let projectSettings: ProjectSettings | undefined;
  let envValues: Record<string, string> = {};
  let repoRoot: string | undefined;
  let stopRefreshOidcToken = () => {};
  if (link.status === 'linked') {
    const { project, org } = link;

    // If repo linked, update `cwd` to the repo root
    if (link.repoRoot) {
      repoRoot = cwd = link.repoRoot;
    }

    client.config.currentTeam = org.type === 'team' ? org.id : undefined;

    projectSettings = project;

    if (project.rootDirectory) {
      cwd = join(cwd, project.rootDirectory);
    }

    envValues = (await pullEnvRecords(client, project.id, 'vercel-cli:dev'))
      .env;

    // Linked environment variables are normally static; however, we want to
    // refresh VERCEL_OIDC_TOKEN, since it can expire. Therefore, we need to
    // exclude it from `envValues` passed to DevServer. If we don't, then
    // updating VERCEL_OIDC_TOKEN in .env.local will have no effect.
    stopRefreshOidcToken = await refreshOidcToken(
      client,
      link,
      envValues,
      'vercel-cli:dev'
    );
  }

  const devServer = new DevServer(cwd, {
    projectSettings,
    envValues,
    repoRoot,
  });

  // listen to SIGTERM for graceful shutdown
  process.on('SIGTERM', () => {
    stopRefreshOidcToken();
    devServer.stop();
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
