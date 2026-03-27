import chalk from 'chalk';
import ms from 'ms';
import { resolve, join } from 'path';
import fs from 'fs-extra';
import {
  type ResolvedService,
  detectPlatformConfigs,
  LocalFileSystemDetector,
} from '@vercel/fs-detectors';

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
  getServicesConfigWriteBlocker,
} from '../../util/projects/detect-services';
import { displayDetectedServices } from '../../util/input/display-services';
import { promptForInferredServicesSetup } from '../../util/link/services-setup';
import { displayPlatformConfigs } from '../../util/input/display-platform-configs';
import { acquireDevLock, releaseDevLock } from '../../util/dev/dev-lock';
import { resolveProjectCwd } from '../../util/projects/find-project-root';

export type DevOptions = {
  '--listen': string;
  '--local': boolean;
  '--yes': boolean;
  '--agent': boolean;
};

export interface DevContext {
  /** Writable stream for child process stdout. Defaults to process.stdout. */
  stdout?: NodeJS.WritableStream;
  /** Writable stream for child process stderr. Defaults to process.stderr. */
  stderr?: NodeJS.WritableStream;
  /** Called before interactive prompts (setupAndLink) that need real terminal. */
  willPrompt?: () => void;
  /** Called after interactive prompts complete. */
  didPrompt?: () => void;
  /** Called once cleanup fn is ready. Use to wire additional exit triggers (e.g. Ctrl+C in TUI).
   *  The callback stops the dev server and releases the lock. Call onShutdown yourself
   *  first if you need to tear down UI before the server stops. */
  onCleanupReady?: (cleanup: () => void) => void;
  /** Called during cleanup to restore terminal state. May return a Promise (e.g. to drain stdin). */
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
    await ctx.onShutdown?.();
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
  let detection = await tryDetectServices(cwd);
  let foundServices =
    detection?.enabled && detection.resolved.services.length > 0;
  if (detection && !detection.enabled && detection.inferred) {
    // Services detected from project layout but not explicitly enabled.
    // Three paths:
    //   1. --yes is set (interactive OR agent re-invocation): auto-configure
    //   2. Non-interactive without --yes: emit action_required JSON so the
    //      agent knows to re-invoke with --yes
    //   3. Interactive without --yes: show a prompt
    const autoConfirm = opts['--yes'] ?? false;
    const writeBlocker = await getServicesConfigWriteBlocker(
      cwd,
      detection.inferred.config
    );

    if (client.nonInteractive && !autoConfirm) {
      // Non-interactive (agent) path without --yes: show what was found,
      // then emit a structured action_required payload and exit so the
      // calling agent can decide whether to re-invoke with --yes.
      displayDetectedServices(detection.inferred.services);

      if (writeBlocker) {
        output.warn(
          `Multiple services were detected, but your existing project config uses \`${writeBlocker}\`. ` +
            'Remove it before enabling multi-service mode.'
        );
      } else {
        outputActionRequired(
          client,
          {
            status: 'action_required',
            reason: 'unconfigured_services',
            message:
              `Detected ${detection.inferred.services.length} services in your project ` +
              'that are not configured. Enable multi-service mode to run them all.',
            hint: 'Re-run with --yes to auto-configure all detected services.',
            next: [
              {
                command: buildCommandWithYes(client.argv),
                when: 'Auto-configure all detected services and start dev server',
              },
            ],
          },
          1
        );
      }
    } else {
      // Interactive path, or --yes (auto-confirm) for both interactive
      // and non-interactive callers. promptForInferredServicesSetup
      // handles autoConfirm by choosing "all services" without prompting.
      ctx.willPrompt?.();
      const choice = await promptForInferredServicesSetup({
        client,
        autoConfirm,
        nonInteractive: client.nonInteractive,
        workPath: cwd,
        inferred: detection.inferred,
        inferredWriteBlocker: writeBlocker,
      });
      ctx.didPrompt?.();

      if (choice?.type === 'services') {
        // Config was written — re-detect so we get the resolved services
        // from the newly written vercel.json.
        detection = await tryDetectServices(cwd);
        if (detection?.enabled && detection.resolved.services.length > 0) {
          foundServices = true;
          services = detection.resolved.services;
        }
      }
    }
  } else if (foundServices && detection) {
    displayDetectedServices(detection.resolved.services);
    services = detection.resolved.services;
  }

  // Detect config files from other cloud platforms / Docker
  const platformDetector = new LocalFileSystemDetector(cwd);
  const platformConfigs = await detectPlatformConfigs(platformDetector);
  if (platformConfigs.configs.length > 0) {
    displayPlatformConfigs(platformConfigs);
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
      await ctx.onShutdown?.();
      return 1;
    }
    lockAcquired = true;
  }

  const devServer = new DevServer(cwd, {
    projectSettings,
    envValues,
    repoRoot,
    services,
    stdout: ctx.stdout,
    stderr: ctx.stderr,
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
  const cleanup = async () => {
    if (cleanupInProgress) return;
    cleanupInProgress = true;

    clearTimeout(timeout);
    controller.abort();

    if (lockAcquired) {
      releaseDevLock(cwd);
    }

    await ctx.onShutdown?.();
    devServer.stop();
  };

  process.on('SIGTERM', () => cleanup());
  process.on('SIGINT', () => cleanup());
  ctx.onCleanupReady?.(() => cleanup());

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
    await ctx.onShutdown?.();
    throw err;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }

  return 0;
}
