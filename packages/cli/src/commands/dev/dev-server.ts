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
import { tryDetectServices } from '../../util/projects/detect-services';
import { displayDetectedServices } from '../../util/input/display-services';
import { acquireDevLock, releaseDevLock } from '../../util/dev/dev-lock';
import { resolveProjectCwd } from '../../util/projects/find-project-root';

export type DevOptions = {
  '--listen': string;
  '--local': boolean;
  '--yes': boolean;
  '--agent': boolean;
};

export interface DevContext {
  /** Called before interactive prompts (setupAndLink) that need real terminal. */
  willPrompt?: () => void;
  /** Called after interactive prompts complete. */
  didPrompt?: () => void;
  /** Called once cleanup fn is ready. Use to wire additional exit triggers (e.g. Ctrl+C in TUI). */
  onCleanupReady?: (cleanup: () => void) => void;
  /** Called during cleanup to restore terminal state. May be async (e.g. to drain stdin). */
  onShutdown?: () => void | Promise<void>;
}

export async function startDevServer(
  client: Client,
  opts: Partial<DevOptions>,
  args: string[],
  telemetry: DevTelemetryClient,
  ctx: DevContext = {}
): Promise<number> {
  const [dir = '.'] = args;
  let cwd = resolve(dir);
  const listen = parseListen(opts['--listen'] || '3000');

  cwd = await resolveProjectCwd(cwd);

  // retrieve dev command
  let link = await getLinkedProject(client, cwd);

  if (link.status === 'not_linked' && !process.env.__VERCEL_SKIP_DEV_CMD) {
    if (opts['--local']) {
      output.warn(
        'Running dev server in local mode without a project setup:\n' +
          '  - Environment variables will not be pulled from Vercel\n' +
          '  - Project settings are defined by local configuration\n\n' +
          `To link your project, run ${getCommandName('dev')} without \`-L\` or \`--local\` or ${getCommandName('link')}.`
      );
    } else {
      ctx.willPrompt?.();
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
      ctx.didPrompt?.();
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
    ctx.onShutdown?.();
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
  const detection = await tryDetectServices(cwd);
  const foundServices =
    detection?.enabled && detection.resolved.services.length > 0;
  if (detection && !detection.enabled) {
    // Services detected from project layout but not explicitly enabled
    output.warn(
      'Detected services in your project. To enable multi-service mode, ' +
        'add `experimentalServices` to vercel.json or set ' +
        'VERCEL_USE_EXPERIMENTAL_SERVICES=1.'
    );
  } else if (foundServices) {
    displayDetectedServices(detection.resolved.services);
    services = detection.resolved.services;
  }

  let lockAcquired = false;
  if (foundServices) {
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
      ctx.onShutdown?.();
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
  const cleanup = async ({ forceExit = false } = {}) => {
    if (cleanupInProgress) return;
    cleanupInProgress = true;

    // Restore terminal state (may drain stdin to prevent key leaks).
    await ctx.onShutdown?.();

    clearTimeout(timeout);
    controller.abort();

    if (lockAcquired) {
      releaseDevLock(cwd);
    }

    // When triggered by a real signal we must force exit since there's
    // no call stack to unwind.  When triggered from TUI input (Ctrl+C/D)
    // we let devServer.stop() resolve devServer.start(), which unwinds
    // startDevServer naturally — avoiding process.exit() prevents stray
    // bytes from leaking to the parent shell.
    if (forceExit) {
      devServer.stop().finally(() => {
        process.exit(0);
      });
    } else {
      devServer.stop();
    }
  };

  process.on('SIGTERM', () => cleanup({ forceExit: true }));
  process.on('SIGINT', () => cleanup({ forceExit: true }));
  ctx.onCleanupReady?.(() => {
    cleanup();
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
  } catch (err) {
    if (lockAcquired) {
      releaseDevLock(cwd);
    }
    ctx.onShutdown?.();
    throw err;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }

  return 0;
}
