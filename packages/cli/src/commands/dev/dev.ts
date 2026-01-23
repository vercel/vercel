import chalk from 'chalk';
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
import output from '../../output-manager';
import { refreshOidcToken } from '../../util/env/refresh-oidc-token';
import type { DevTelemetryClient } from '../../util/telemetry/commands/dev';
import { VERCEL_OIDC_TOKEN } from '../../util/env/constants';
import { connect as connectTunnel } from '../../util/dev/tunnel';

type Options = {
  '--listen': string;
  '--yes': boolean;
  '--tunnel': string;
};

export default async function dev(
  client: Client,
  opts: Partial<Options>,
  args: string[],
  telemetry: DevTelemetryClient
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
  }

  const devServer = new DevServer(cwd, {
    projectSettings,
    envValues,
    repoRoot,
  });

  const controller = new AbortController();
  const timeout = setTimeout(async () => {
    if (link.status !== 'linked') return;

    try {
      let refreshCount = 0;
      for await (const token of refreshOidcToken(
        controller.signal,
        client,
        link.project.id,
        envValues,
        'vercel-cli:dev'
      )) {
        output.debug(`Refreshing ${chalk.green(VERCEL_OIDC_TOKEN)}`);
        envValues[VERCEL_OIDC_TOKEN] = token;
        await devServer.runDevCommand(true);
        telemetry.trackOidcTokenRefresh(++refreshCount);
      }
    } catch (error) {
      // Throw any error aside from an abort error.
      if (!(error instanceof Error && error.name === 'AbortError')) {
        throw error;
      }
      output.debug('OIDC token refresh was aborted');
    }
  });

  // listen to SIGTERM for graceful shutdown
  process.on('SIGTERM', () => {
    clearTimeout(timeout);
    controller.abort();
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

  try {
    await devServer.start(...listen);

    // Start tunnel if --tunnel flag is provided
    if (opts['--tunnel']) {
      const tunnelName = opts['--tunnel'];
      const oidcToken = envValues[VERCEL_OIDC_TOKEN];

      if (!oidcToken) {
        output.error(
          'Tunnel requires a linked project with OIDC token. Run `vercel link` first.'
        );
        return 1;
      }

      const localPort = parseInt(devServer.address.port, 10);
      connectTunnel(tunnelName, oidcToken, '127.0.0.1', localPort);
    }
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
