import chalk from 'chalk';
import ms from 'ms';
import { resolve, join } from 'path';
import fs from 'fs-extra';
import type { ResolvedService } from '@vercel/fs-detectors';

import DevServer from '../../util/dev/server';
import { parseListen } from '../../util/dev/parse-listen';
import type Client from '../../util/client';
import { getLinkedProject } from '../../util/projects/link';
import type { ProjectSettings } from '@vercel-internals/types';
import setupAndLink from '../../util/link/setup-and-link';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import param from '../../util/output/param';
import cmd from '../../util/output/cmd';
import { OUTPUT_DIR } from '../../util/build/write-build-result';
import { pullEnvRecords } from '../../util/env/get-env-records';
import output from '../../output-manager';
import { refreshOidcToken } from '../../util/env/refresh-oidc-token';
import {
  outputActionRequired,
  buildCommandWithYes,
} from '../../util/agent-output';
import type { DevTelemetryClient } from '../../util/telemetry/commands/dev';
import { VERCEL_OIDC_TOKEN } from '../../util/env/constants';
import {
  tryDetectServices,
  isExperimentalServicesEnabled,
} from '../../util/projects/detect-services';
import { displayDetectedServices } from '../../util/input/display-services';
import { acquireDevLock, releaseDevLock } from '../../util/dev/dev-lock';

type Options = {
  '--listen': string;
  '--yes': boolean;
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
      nonInteractive: client.nonInteractive,
    });

    if (link.status === 'not_linked') {
      // User aborted project linking questions
      return 0;
    }
  }

  if (link.status === 'error') {
    if (link.reason === 'HEADLESS') {
      if (client.nonInteractive) {
        outputActionRequired(
          client,
          {
            status: 'action_required',
            reason: 'confirmation_required',
            message: `Command ${getCommandNamePlain('dev')} requires confirmation. Use option --yes to confirm.`,
            next: [
              {
                command: buildCommandWithYes(client.argv),
                when: 'Confirm and run',
              },
            ],
          },
          link.exitCode
        );
      } else {
        output.error(
          `Command ${getCommandName(
            'dev'
          )} requires confirmation. Use option ${param('--yes')} to confirm.`
        );
      }
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

  let services: ResolvedService[] | undefined;
  if (isExperimentalServicesEnabled()) {
    const result = await tryDetectServices(cwd);
    if (result && result.services.length > 0) {
      displayDetectedServices(result.services);
      services = result.services;
    }
  }

  let lockAcquired = false;
  if (isExperimentalServicesEnabled()) {
    const port = typeof listen[0] === 'number' ? listen[0] : 0;
    const lockResult = await acquireDevLock(cwd, port);

    if (!lockResult.acquired) {
      output.error(
        `Another ${getCommandName('dev')} process is already running for this project.`
      );
      if (lockResult.existingLock) {
        const { existingLock } = lockResult;
        const startTime = ms(Date.now() - existingLock.startedAt);
        output.print(`  Port: ${chalk.cyan(existingLock.port)}\n`);
        output.print(`  PID: ${chalk.cyan(existingLock.pid)}\n`);
        output.print(`  Started: ${chalk.cyan(startTime)} ago\n`);
        output.log(
          `To stop the existing process, press Ctrl+C in its terminal or run: ` +
            cmd(`kill ${existingLock.pid}`)
        );
      } else {
        output.log(lockResult.reason);
      }
      return 1;
    }
    lockAcquired = true;
  }

  const devServer = new DevServer(cwd, {
    projectSettings,
    envValues,
    repoRoot,
    services,
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

  let cleanupInProgress = false;
  const cleanup = async (signal: string) => {
    if (cleanupInProgress) return;
    cleanupInProgress = true;

    output.debug(`Received ${signal}, shutting down...`);

    clearTimeout(timeout);
    controller.abort();

    if (lockAcquired) {
      releaseDevLock(cwd);
    }

    await devServer.stop();

    let exitCode = 0;
    switch (signal) {
      case 'SIGINT':
        exitCode = 130;
        break;
      case 'SIGTERM':
        exitCode = 143;
        break;
    }

    process.exit(exitCode);
  };

  process.on('SIGTERM', async () => await cleanup('SIGTERM'));
  process.on('SIGINT', async () => await cleanup('SIGINT'));

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
  } catch (err) {
    if (lockAcquired) {
      releaseDevLock(cwd);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
