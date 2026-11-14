import chalk from 'chalk';
import ms from 'ms';
import { resolve, join } from 'path';
import fs from 'fs-extra';
import { detectFramework, LocalFileSystemDetector } from '@vercel/fs-detectors';
import { frameworkList } from '@vercel/frameworks';
import { getDaemonNames, type Service } from '@vercel/build-utils';

import DevServer from '../../util/dev/server';
import { parseListen } from '../../util/dev/parse-listen';
import {
  dev as devDiagnostics,
  DevCommandExitError,
} from '../../util/dev/diagnostics';
import { createErrorReporter } from '../../util/dev/report-error';
import type Client from '../../util/client';
import { getLinkedProject } from '../../util/projects/link';
import link from '../../util/output/link';
import getPort from 'get-port';
import type { Org } from '@vercel-internals/types';
import { getEnabledProtection } from '../../util/deploy/get-enabled-protection';
import type { Route } from '@vercel/routing-utils';
import { TunnelReplacedError } from '../../util/dev/tunnel/client';
import { formatTunnelError, TunnelError } from '../../util/dev/tunnel/errors';
import chars from '../../util/output/chars';
import { projectRoutes } from '../../util/dev/tunnel/routing';
import { startTunnel, type RunningTunnel } from '../../util/dev/tunnel/start';
import { printProjectNotFoundError } from '../../util/projects/project-not-found-error';
import type { ProjectSettings } from '@vercel-internals/types';
import setupAndLink from '../../util/link/setup-and-link';
import { findRepoRoot } from '../../util/link/repo';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import param from '../../util/output/param';
import { OUTPUT_DIR } from '../../builders/write-build-result';
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
  loadVercelConfig,
  tryDetectServices,
} from '../../util/projects/detect-services';
import { promptExperimentalServicesMigration } from '../../util/services/migrate-experimental-services';
import { displayDetectedServices } from '../../util/input/display-services';
import { assertNoBuildpackServices } from '../../util/dev/buildpack-dev';
import { acquireDevLock, releaseDevLock } from '../../util/dev/dev-lock';
import { resolveProjectCwd } from '../../util/projects/find-project-root';
import { detectExplicitScope } from '../../util/get-scope';
import type { VercelConfig } from '../../util/dev/types';

type Options = {
  '--listen': string;
  '--local': boolean;
  '--yes': boolean;
  '--project': string;
  '--queue-port': string;
  '--runtime-cache-port': string;
  /** A name from `--tunnel=<label>`, or true for the default one. */
  '--tunnel': boolean | string;
  '--schedules-port': string;
};

function parseResourcePort(
  value: string | undefined,
  flag: '--queue-port' | '--runtime-cache-port' | '--schedules-port'
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!/^\d+$/.test(value)) {
    throw new Error(`${flag} must be an integer between 0 and 65535`);
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port > 65535) {
    throw new Error(`${flag} must be an integer between 0 and 65535`);
  }
  return port;
}

export default async function dev(
  client: Client,
  opts: Partial<Options>,
  args: string[],
  telemetry: DevTelemetryClient,
  localConfig: VercelConfig | null
) {
  const [dir = '.'] = args;
  let cwd = resolve(dir);
  const localConfigCwd = cwd;
  const listen = parseListen(opts['--listen'] || '3000');
  const queuePort = parseResourcePort(opts['--queue-port'], '--queue-port');
  const runtimeCachePort = parseResourcePort(
    opts['--runtime-cache-port'],
    '--runtime-cache-port'
  );
  const schedulesPort = parseResourcePort(
    opts['--schedules-port'],
    '--schedules-port'
  );
  const resourcePorts = [
    ['--queue-port', queuePort],
    ['--runtime-cache-port', runtimeCachePort],
    ['--schedules-port', schedulesPort],
  ] as const;
  for (const [index, [flag, port]] of resourcePorts.entries()) {
    const duplicate = resourcePorts
      .slice(0, index)
      .find(
        ([, otherPort]) =>
          port !== undefined && port !== 0 && port === otherPort
      );
    if (duplicate) {
      throw new Error(`${duplicate[0]} and ${flag} must use different ports`);
    }
  }

  cwd = await resolveProjectCwd(cwd);

  const projectNameOrId = opts['--project'];

  const reportError = createErrorReporter(code => telemetry.trackError(code));

  // retrieve dev command
  let link = await getLinkedProject(client, {
    cwd,
    projectName: projectNameOrId,
    projectNameIsExplicit: Boolean(projectNameOrId),
    scopeIsExplicit: detectExplicitScope(client),
  });

  if (link.status === 'not_linked' && !process.env.__VERCEL_SKIP_DEV_CMD) {
    if (opts['--local']) {
      output.warn(
        'Running dev server in local mode without a project setup:\n' +
          '  - Environment variables will not be pulled from Vercel\n' +
          '  - Project settings are defined by local configuration\n\n' +
          `To link your project, run ${getCommandName('dev')} without \`-L\` or \`--local\` or ${getCommandName('link')}.`
      );
    } else if (projectNameOrId) {
      await printProjectNotFoundError(
        client,
        projectNameOrId,
        'dev',
        link.orgId
      );
      return 1;
    } else {
      link = await setupAndLink(client, cwd, {
        autoConfirm: opts['--yes'],
        link,
        successEmoji: 'link',
        nonInteractive: client.nonInteractive,
      });

      if (link.status === 'not_linked') {
        // User aborted project linking questions
        return 0;
      }
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
  let projectId: string | undefined;
  let orgId: string | undefined;
  if (link.status === 'linked') {
    const { project, org } = link;

    // Resolve the effective repo root so that `rootDirectory` is always
    // interpreted relative to the repository, not relative to wherever the
    // user happened to run the command from. For repo links the root comes
    // from `repo.json`; otherwise fall back to `findRepoRoot` (which walks
    // up looking for `.git`). This avoids double-appending `rootDirectory`
    // when the user runs `vercel dev` from inside the project folder.
    if (link.repoRoot) {
      repoRoot = cwd = link.repoRoot;
    } else if (project.rootDirectory) {
      const monorepoRoot = await findRepoRoot(cwd);
      if (monorepoRoot) {
        repoRoot = cwd = monorepoRoot;
      }
    }

    client.config.currentTeam = org.type === 'team' ? org.id : undefined;

    const settings = { ...project };
    delete (settings as typeof settings & { env?: unknown }).env;
    delete settings.latestDeployments;
    projectSettings = settings;

    projectId = project.id;
    orgId = org.id;

    if (project.rootDirectory) {
      cwd = join(cwd, project.rootDirectory);
    }

    envValues = (await pullEnvRecords(client, project.id, 'vercel-cli:dev'))
      .env;
  }

  let services: Service[] | undefined;
  let useImplicitServicesEnvInjection = true;
  // The config of the resolved project directory, so linked `rootDirectory`
  // projects started from the repo root see their own config. --local-config
  // names one file wherever the project is.
  const projectConfig =
    cwd === localConfigCwd || client.localConfigPath
      ? localConfig
      : await loadVercelConfig(cwd);
  let servicesResult = await tryDetectServices(cwd, projectConfig);
  if (
    // It compiles and rewrites the project's own config file, which
    // --local-config sets aside.
    !client.localConfigPath &&
    (await promptExperimentalServicesMigration({
      client,
      cwd,
      autoConfirm: Boolean(opts['--yes']),
      nonInteractive: client.nonInteractive,
      detectServicesResult: servicesResult,
    }))
  ) {
    servicesResult = await tryDetectServices(cwd);
  }
  const foundServices = servicesResult && servicesResult.services.length > 0;
  const daemonNames = getDaemonNames(projectConfig);
  if (daemonNames.length > 0) {
    output.warn(
      `${getCommandName('dev')} doesn't run daemons: ${daemonNames.join(', ')}. Run them with Docker.`
    );
  }
  if (servicesResult && foundServices) {
    services = servicesResult.services;
    displayDetectedServices(services);
    useImplicitServicesEnvInjection = servicesResult.useImplicitEnvInjection;
    // Buildpack builds have no dev equivalent yet. Fail here, before the dev
    // lock is taken and any service starts, so the error is the only output.
    assertNoBuildpackServices(services);
  }

  const hasExplicitBuilds = Boolean(localConfig?.builds?.length);
  const hasExplicitFramework = localConfig?.framework !== undefined;
  const hasServicesConfig = Boolean(
    localConfig?.services ??
      localConfig?.experimentalServicesV2 ??
      localConfig?.experimentalServices
  );
  const shouldDetectFramework =
    link.status === 'not_linked' &&
    Boolean(opts['--local']) &&
    !foundServices &&
    !hasServicesConfig &&
    !hasExplicitBuilds &&
    !hasExplicitFramework;

  if (shouldDetectFramework) {
    const detectedFramework = await detectFramework({
      fs: new LocalFileSystemDetector(cwd),
      frameworkList,
    });
    if (detectedFramework) {
      output.debug(
        `Detected framework ${detectedFramework} for unlinked local dev`
      );
      projectSettings = { framework: detectedFramework };
    }
  }

  // `--tunnel` runs the app as `vc dev` does, without the router: the tunnel's
  // deployment routes, and reaches the Development Command on one port.
  let tunnel: TunnelProject | undefined;
  if (opts['--tunnel']) {
    if (link.status !== 'linked') {
      output.fatal(
        `${getCommandName('dev --tunnel')} requires a linked project. Run ${getCommandName('link')} first.`
      );
      return 1;
    }
    if (foundServices) {
      output.fatal(
        `${getCommandName('dev --tunnel')} doesn't support projects with services yet.`
      );
      return 1;
    }
    const { org, project } = link;
    // The tunnel's URL is a preview of the project, so it's only as protected
    // as the project's previews; unprotected, anyone with it reaches this
    // machine's dev server. A deployment can't be protected on its own.
    const protection = await getEnabledProtection(client, {
      id: project.id,
      accountId: org.id,
    });
    if (!protection?.length) {
      output.fatal(
        protection
          ? `${getCommandName('dev --tunnel')} needs Deployment Protection on ${project.name}'s preview deployments, or anyone with the tunnel's URL could reach your dev server. Turn on Vercel Authentication under Settings → Deployment Protection.`
          : `Could not read ${project.name}'s Deployment Protection settings, so ${getCommandName('dev --tunnel')} won't expose your dev server.`
      );
      return 1;
    }
    tunnel = {
      org,
      projectId: project.id,
      projectName: project.name,
      rootDirectory: project.rootDirectory,
      ...(typeof opts['--tunnel'] === 'string' && {
        aliasLabel: opts['--tunnel'],
      }),
      // The port asked for, or a free one for `--listen 0`.
      port:
        typeof listen[0] === 'number' ? listen[0] || (await getPort()) : 3000,
    };
  }

  let lockAcquired = false;
  if (foundServices) {
    const port = typeof listen[0] === 'number' ? listen[0] : 0;
    const lockResult = await acquireDevLock(cwd, port);

    if (!lockResult.acquired) {
      let detail: string;
      if (lockResult.existingLock) {
        const { existingLock } = lockResult;
        const startTime = ms(Date.now() - existingLock.startedAt);
        detail =
          `Port: ${existingLock.port}\n` +
          `PID: ${existingLock.pid}\n` +
          `Started: ${startTime} ago\n` +
          `Stop it by pressing Ctrl+C in its terminal, or run \`kill ${existingLock.pid}\`.`;
      } else {
        detail = lockResult.reason;
      }
      reportError(devDiagnostics.DEV_LOCK_HELD({ detail }));
      return 1;
    }
    lockAcquired = true;
  }

  // The project's routes for the tunnel's proxy, from its config as it is now,
  // `vercel.ts` compiled: each change that alters them redeploys the proxy.
  let routes: Route[] = [];
  let runningTunnel: RunningTunnel | undefined;
  let tunnelUrl: string | undefined;
  const applyRoutes = () => {
    runningTunnel?.setRoutes(routes).then(
      url => {
        if (url === tunnelUrl) return;
        tunnelUrl = url;
        announceTunnel(url);
      },
      (err: unknown) =>
        output.warning(
          formatTunnelError(
            "Couldn't deploy the tunnel proxy with the new routes. The tunnel keeps the old ones.",
            err
          )
        )
    );
  };

  const devServer = new DevServer(cwd, {
    projectSettings,
    envValues,
    repoRoot,
    services,
    useImplicitServicesEnvInjection,
    projectId,
    orgId,
    queuePort,
    runtimeCachePort,
    schedulesPort,
    ...(tunnel && {
      routing: false,
      devCommandPort: tunnel.port,
      onConfig: config => {
        routes = projectRoutes(config);
        applyRoutes();
      },
    }),
    onErrorCode: code => telemetry.trackError(code),
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
        await devServer.updateEnvValues({ [VERCEL_OIDC_TOKEN]: token });
        telemetry.trackOidcTokenRefresh(++refreshCount);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        output.debug('OIDC token refresh was aborted');
        return;
      }
      // if on forced restart after OIDC refresh
      // we can't restart a dev command, then we can only
      // show the error and exit
      if (error instanceof DevCommandExitError) {
        output.error(error.message);
        await cleanup(error.exitCode);
        return;
      }
      throw error;
    }
  });

  const shutdown = async () => {
    clearTimeout(timeout);
    controller.abort();

    if (lockAcquired) {
      releaseDevLock(cwd);
    }

    runningTunnel?.close();
    // Before the dev server's stop, which can block the event loop long enough
    // (closing a big project's watchers) that the release never goes out.
    await runningTunnel?.release();
    await devServer.stop();
  };

  let cleanupInProgress = false;
  const cleanup = async (reason: string | number) => {
    if (cleanupInProgress) return;
    cleanupInProgress = true;

    output.debug(
      typeof reason === 'number'
        ? `Exiting with code ${reason}, shutting down...`
        : `Received ${reason}, shutting down...`
    );

    await shutdown();

    let exitCode: number;
    if (typeof reason === 'number') {
      exitCode = reason;
    } else {
      switch (reason) {
        case 'SIGINT':
          exitCode = 130;
          break;
        case 'SIGTERM':
          exitCode = 143;
          break;
        case 'SIGHUP':
          exitCode = 129;
          break;
        default:
          exitCode = 0;
      }
    }

    process.exit(exitCode);
  };

  process.on('SIGTERM', async () => await cleanup('SIGTERM'));
  process.on('SIGINT', async () => await cleanup('SIGINT'));
  // Run cleanup on terminal disconnect too; Node's default SIGHUP behavior is
  // to terminate immediately, which would bypass async service shutdown and
  // leave the synchronous 'exit' backstop as the only line of defense.
  process.on('SIGHUP', async () => await cleanup('SIGHUP'));

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
    // Refreshes run for the whole session; cleanup ends them on shutdown.
    clearTimeout(timeout);
    controller.abort();
    if (lockAcquired) {
      releaseDevLock(cwd);
    }
    throw err;
  }

  if (!tunnel) return;
  const target = devServer.devCommandOrigin;
  if (!target) {
    output.fatal(
      `${getCommandName('dev --tunnel')} requires a Development Command on the project.`
    );
    await shutdown();
    return 1;
  }
  try {
    const code = await runTunnel(
      client,
      tunnel,
      target,
      // shutdown() aborts `controller`.
      controller.signal,
      () => routes,
      started => {
        runningTunnel = started;
        tunnelUrl = started.url;
        // The routes may have changed while it deployed.
        applyRoutes();
      }
    );
    await shutdown();
    return code;
  } catch (err) {
    await shutdown();
    throw err;
  }
}

/** Waits between attempts to bring a replaced tunnel back. */
const TUNNEL_RETRY_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];

/** Resolves after `ms`, or as soon as `signal` aborts. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}

/** The run's one result, so it stands out in the app's output. */
function announceTunnel(url: string) {
  output.print(`${chalk.green(chars.tick)} Tunnel available at ${link(url)}\n`);
}

interface TunnelProject {
  org: Org;
  projectId: string;
  projectName: string;
  rootDirectory?: string | null;
  /** The tunnel URL's first label from `--tunnel=<label>`. */
  aliasLabel?: string;
  /** Where the Development Command listens, and the only port conns reach. */
  port: number;
}

/**
 * Expose the Development Command `vc dev` started through a Vercel deployment,
 * which applies the project's routes. Runs until shutdown closes the tunnel,
 * deploying the proxy again whenever the tunnel is replaced.
 */
async function runTunnel(
  client: Client,
  project: TunnelProject,
  target: string,
  shuttingDown: AbortSignal,
  routes: () => Route[],
  onStarted: (tunnel: RunningTunnel) => void
): Promise<number> {
  let started = false;
  let attempt = 0;
  for (;;) {
    let tunnel: RunningTunnel;
    try {
      tunnel = await startTunnel({
        client,
        ...project,
        target,
        routes: routes(),
        signal: shuttingDown,
        resumed: started,
      });
    } catch (err) {
      if (shuttingDown.aborted) return 0;
      // At startup there's nothing to keep, so the error stops vc dev. Once
      // the tunnel is being replaced, the dev server is up and worth keeping.
      if (!started) {
        // Others, the API's included, go to the shared handler.
        if (!(err instanceof TunnelError)) throw err;
        output.fatal(formatTunnelError(err.message, err));
        return 1;
      }
      const delay =
        TUNNEL_RETRY_DELAYS_MS[
          Math.min(attempt++, TUNNEL_RETRY_DELAYS_MS.length - 1)
        ];
      output.warning(
        formatTunnelError(
          `Couldn't bring the tunnel back.${err instanceof TunnelError ? ` ${err.message}` : ''} Trying again in ${delay / 1000}s.`,
          err
        )
      );
      await wait(delay, shuttingDown);
      if (shuttingDown.aborted) return 0;
      continue;
    }
    started = true;
    attempt = 0;
    // Shutdown only closes a tunnel that had already started.
    if (shuttingDown.aborted) {
      tunnel.close();
      return 0;
    }
    announceTunnel(tunnel.url);
    onStarted(tunnel);
    const lost = await tunnel.done.then(
      () => undefined,
      (err: unknown) => err
    );
    if (lost instanceof TunnelReplacedError) {
      output.print(
        '  The tunnel was replaced, so its proxy is deploying again\n'
      );
      tunnel.close();
      continue;
    }
    if (lost === undefined) return 0;
    output.fatal(
      formatTunnelError(
        `${lost instanceof TunnelError ? lost.message : 'Lost the tunnel.'} Stopped the dev server.`,
        lost
      )
    );
    return 1;
  }
}
