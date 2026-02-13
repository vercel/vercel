import path from 'path';
import ms from 'ms';
import { Transform, Writable, type TransformCallback } from 'stream';
import type { ChildProcess } from 'child_process';
import getPort from 'get-port';
import chalk from 'chalk';
import type { Service } from '@vercel/fs-detectors';
import { frameworkList, type Framework } from '@vercel/frameworks';
import {
  cloneEnv,
  getNodeBinPaths,
  spawnCommand,
  NowBuildError,
  runNpmInstall,
  getServiceUrlEnvVars,
  type BuilderV3,
  type Config,
} from '@vercel/build-utils';
import { checkForPort } from './port-utils';
import { importBuilders } from '../build/import-builders';
import output from '../../output-manager';
import { treeKill } from '../tree-kill';

const STARTUP_TIMEOUT = ms('5m');

export class ServiceStartError extends Error {
  constructor(failures: Error[]) {
    // Deduplicate errors that are the same for all services
    const dedupeErrorCodes = new Set(['PYTHON_EXTERNAL_VENV_DETECTED']);
    const seenCodes = new Set<string>();
    const uniqueMessages: string[] = [];

    for (const err of failures) {
      if (err instanceof NowBuildError && dedupeErrorCodes.has(err.code)) {
        if (!seenCodes.has(err.code)) {
          uniqueMessages.push(err.message);
          seenCodes.add(err.code);
        }
      } else {
        uniqueMessages.push(err.message);
      }
    }

    super(uniqueMessages.join('\n'));
  }
}

const SERVICE_COLORS = [
  chalk.cyan,
  chalk.magenta,
  chalk.yellow,
  chalk.green,
  chalk.blue,
];

interface ServiceLogger {
  stdout: Transform;
  stderr: Transform;
  cleanup: () => void;
}

function createServiceLogger(
  serviceName: string,
  colorIndex: number,
  maxNameLength: number
): ServiceLogger {
  const color = SERVICE_COLORS[colorIndex % SERVICE_COLORS.length];
  const padding = ' '.repeat(maxNameLength - serviceName.length);
  const prefix = color(`[${serviceName}]`) + padding;

  const createTransform = () => {
    let buffer = '';
    return new Transform({
      transform(
        chunk: Buffer,
        _encoding: BufferEncoding,
        callback: TransformCallback
      ) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || '';
        // Output complete lines with prefix
        if (lines.length > 0) {
          const prefixed = lines.map(line => `${prefix} ${line}`).join('\n');
          callback(null, prefixed + '\n');
        } else {
          callback(null, '');
        }
      },
      flush(callback: TransformCallback) {
        // Output any remaining buffered content on close
        if (buffer) {
          callback(null, `${prefix} ${buffer}\n`);
        } else {
          callback(null, '');
        }
      },
    });
  };

  const stdout = createTransform();
  const stderr = createTransform();

  stdout.pipe(process.stdout);
  stderr.pipe(process.stderr);

  const cleanup = () => {
    stdout.unpipe(process.stdout);
    stderr.unpipe(process.stderr);
    stdout.destroy();
    stderr.destroy();
  };

  return { stdout, stderr, cleanup };
}

interface ServiceDevProcess {
  name: string;
  host: string;
  port: number;
  pid: number;
  process?: ChildProcess;
  shutdown?: () => Promise<void>;
  routePrefix: string;
  workspace: string;
  logger: ServiceLogger;
}

interface ServicesOrchestratorOptions {
  services: Service[];
  cwd: string;
  repoRoot: string;
  env: NodeJS.ProcessEnv;
  proxyOrigin: string;
}

export class ServicesOrchestrator {
  private managedServices = new Map<string, ServiceDevProcess>();
  private managedProcesses = new Map<string, ChildProcess>();
  private stopping = false;

  private services: Service[];
  private cwd: string;
  private repoRoot: string;
  private env: NodeJS.ProcessEnv;
  private maxNameLength: number;
  private proxyOrigin: string;
  private pythonServiceCount: number;

  constructor(options: ServicesOrchestratorOptions) {
    this.services = options.services;
    this.cwd = options.cwd;
    this.repoRoot = options.repoRoot;
    this.maxNameLength = Math.max(...options.services.map(s => s.name.length));
    this.proxyOrigin = options.proxyOrigin;
    this.env = options.env;
    this.pythonServiceCount = options.services.filter(
      s => s.runtime === 'python'
    ).length;
  }

  async startAll(): Promise<void> {
    output.debug(`Starting ${this.services.length} services`);

    const startPromises = this.services.map((service, index) =>
      this.startService(service, index).then(result => {
        this.managedServices.set(result.name, result);
        return result;
      })
    );

    const results = await Promise.allSettled(startPromises);

    const failures = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    );

    if (failures.length > 0) {
      await this.stopAll();
      throw new ServiceStartError(failures.map(f => f.reason as Error));
    }

    output.debug(
      `All ${this.managedServices.size} services started successfully`
    );
  }

  async stopAll(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;

    const totalCount = this.managedServices.size + this.managedProcesses.size;
    output.debug(`Stopping ${totalCount} services/processes`);

    const stopPromises: Promise<void>[] = [];

    for (const [name, service] of this.managedServices) {
      output.debug(`Stopping service "${name}" (PID: ${service.pid})`);

      // For some builders (e.g. @vercel/python) `shutdown` is defined as no-op,
      // so we'll try to be nice at first, but then proceed with killing the tree.
      const stopService = async () => {
        if (service.shutdown) {
          await service.shutdown().catch(err => {
            output.debug(`Failed to shutdown service "${name}": ${err}`);
          });
        }

        if (service.pid) {
          await treeKill(service.pid).catch(err => {
            output.debug(`Failed to kill service "${name}": ${err}`);
          });
        }
      };
      stopPromises.push(stopService());

      service.logger.cleanup();
    }

    for (const [name, proc] of this.managedProcesses) {
      if (proc.pid && !this.managedServices.has(name)) {
        output.debug(`Stopping process "${name}" (PID: ${proc.pid})`);
        stopPromises.push(
          treeKill(proc.pid).catch(err => {
            output.debug(`Failed to stop process "${name}": ${err}`);
          })
        );
      }
    }

    await Promise.all(stopPromises);
    this.managedServices.clear();
    this.managedProcesses.clear();
    output.debug('All services stopped');
  }

  getServiceForRoute(pathname: string): ServiceDevProcess | null {
    let bestMatch: ServiceDevProcess | null = null;
    let bestMatchLength = -1;

    for (const service of this.managedServices.values()) {
      const { routePrefix } = service;

      if (routePrefix === '/') {
        if (bestMatchLength === -1) {
          bestMatch = service;
          bestMatchLength = 0;
        }
        continue;
      }

      const normalizedPrefix = routePrefix.startsWith('/')
        ? routePrefix
        : `/${routePrefix}`;

      if (
        pathname === normalizedPrefix ||
        pathname.startsWith(`${normalizedPrefix}/`)
      ) {
        if (normalizedPrefix.length > bestMatchLength) {
          bestMatch = service;
          bestMatchLength = normalizedPrefix.length;
        }
      }
    }

    return bestMatch;
  }

  getServiceOrigin(serviceName: string): string | null {
    const service = this.managedServices.get(serviceName);
    return service ? `http://${service.host}:${service.port}` : null;
  }

  hasServices(): boolean {
    return this.managedServices.size > 0;
  }

  getServices(): Map<string, ServiceDevProcess> {
    return this.managedServices;
  }

  private async startService(
    service: Service,
    colorIndex: number
  ): Promise<ServiceDevProcess> {
    const workspacePath = path.join(this.cwd, service.workspace || '.');
    const framework = frameworkList.find(f => f.slug === service.framework);
    const logger = createServiceLogger(
      service.name,
      colorIndex,
      this.maxNameLength
    );

    const serviceUrlEnvVars = getServiceUrlEnvVars({
      services: this.services,
      frameworkList: framework ? [framework] : [],
      origin: this.proxyOrigin,
      currentEnv: this.env,
    });

    const env = cloneEnv(
      {
        FORCE_COLOR: process.stdout.isTTY ? '1' : '0',
        BROWSER: 'none',
      },
      process.env,
      this.env,
      serviceUrlEnvVars
    );

    if (service.routePrefix && service.routePrefix !== '/') {
      env.VERCEL_SERVICE_BASE_PATH = service.routePrefix;
    }

    // Try to use builder's startDevServer if available
    // Prefer framework's useRuntime, but fall back to resolved builder from service config
    const builderSpec = framework?.useRuntime?.use || service.builder?.use;
    if (builderSpec) {
      const result = await this.tryStartWithBuilder(
        service,
        builderSpec,
        workspacePath,
        env,
        logger
      );
      if (result) {
        return result;
      }
    }

    // Fallback to framework's devCommand
    return this.startServiceWithDevCommand(
      service,
      framework,
      workspacePath,
      env,
      logger
    );
  }

  private async tryStartWithBuilder(
    service: Service,
    builderSpec: string,
    workspacePath: string,
    env: NodeJS.ProcessEnv,
    logger: ServiceLogger
  ): Promise<ServiceDevProcess | null> {
    try {
      const builders = await importBuilders(new Set([builderSpec]), this.cwd);
      const builderWithPkg = builders.get(builderSpec);
      const builder = builderWithPkg?.builder as BuilderV3 | undefined;

      if (builder?.version !== 3 || !builder.startDevServer) {
        return null;
      }

      output.debug(
        `Starting ${chalk.bold(service.name)} using ${chalk.cyan.bold(builderSpec)}`
      );

      // Use the resolved builder.src which includes framework defaults,
      // or fall back to explicit entrypoint.
      // Strip the workspace prefix since workPath is already the service workspace.
      // e.g., builder.src="frontend/package.json" + workspace="frontend"
      //   → entrypoint="package.json" (relative to workspacePath)
      let entrypoint = service.builder?.src || service.entrypoint || '';
      const workspace = service.workspace || '.';
      if (workspace !== '.') {
        const wsPrefix = workspace + '/';
        if (entrypoint.startsWith(wsPrefix)) {
          entrypoint = entrypoint.slice(wsPrefix.length);
        }
      }
      // Mirror services build behavior in dev: when a service doesn't declare
      // an explicit framework (runtime-only services), builders should still
      // receive the project framework context of "services".
      const frameworkForDev = service.framework || 'services';
      const result = await builder.startDevServer({
        entrypoint,
        workPath: workspacePath,
        repoRootPath: this.repoRoot,
        config: {
          ...(service.builder?.config || {}),
          framework: frameworkForDev,
        },
        meta: {
          isDev: true,
          env,
          serviceCount: this.services.length,
          pythonServiceCount: this.pythonServiceCount,
          syncDependencies: true,
        },
        files: {},
        onStdout: (data: Buffer) => logger.stdout.write(data),
        onStderr: (data: Buffer) => logger.stderr.write(data),
      });

      if (!result) {
        return null;
      }

      const host = await checkForPort(result.port, STARTUP_TIMEOUT);
      output.debug(`Service ${service.name} started on ${host}:${result.port}`);

      return {
        name: service.name,
        host,
        port: result.port,
        pid: result.pid,
        shutdown: result.shutdown,
        routePrefix: service.routePrefix || '/',
        workspace: service.workspace || '.',
        logger,
      };
    } catch (err) {
      output.debug(`Failed to use startDevServer for ${service.name}: ${err}`);
      // Re-throw NowBuildError so user-facing errors are displayed properly
      if (err instanceof NowBuildError) {
        throw err;
      }
      return null;
    }
  }

  // Adapted from DevServer
  private async startServiceWithDevCommand(
    service: Service,
    framework: Framework | undefined,
    workspacePath: string,
    env: NodeJS.ProcessEnv,
    logger: ServiceLogger
  ): Promise<ServiceDevProcess> {
    const devCommand = framework?.settings?.devCommand?.value;
    if (!devCommand) {
      throw new Error(
        `No dev server available for service "${service.name}" (framework: ${service.framework})`
      );
    }

    await this.syncDependencies(service.builder?.config, workspacePath, logger);

    const port = await getPort();
    env.PORT = `${port}`;

    // Add node_modules/.bin to PATH
    const nodeBinPaths = getNodeBinPaths({
      base: this.repoRoot,
      start: workspacePath,
    });
    const nodeBinPath = nodeBinPaths.join(path.delimiter);
    env.PATH = `${nodeBinPath}${path.delimiter}${env.PATH}`;

    output.debug(
      `Starting ${chalk.bold(service.name)} with ${chalk.cyan.bold(`"${devCommand}"`)}`
    );

    const child = spawnCommand(devCommand, {
      cwd: workspacePath,
      env,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    if (!child.pid) {
      throw new Error(
        `Failed to start service "${service.name}": no PID returned`
      );
    } else if (!child.stdout || !child.stderr) {
      throw new Error(
        `Failed to start service "${service.name}": expected child process to have stdout and stderr`
      );
    }

    // Track process immediately so we can kill it if startup fails
    this.managedProcesses.set(service.name, child);

    child.stdout?.on('data', (chunk: Buffer) => {
      logger.stdout.write(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      logger.stderr.write(chunk);
    });

    let host: string;
    try {
      host = await this.waitForPort(child, service.name, port);
    } catch (error) {
      this.managedProcesses.delete(service.name);
      throw error;
    }

    output.debug(`Service ${service.name} listening on ${host}:${port}`);

    return {
      name: service.name,
      host,
      port,
      pid: child.pid,
      process: child,
      routePrefix: service.routePrefix || '/',
      workspace: service.workspace || '.',
      logger,
    };
  }

  private async waitForPort(
    child: ChildProcess,
    serviceName: string,
    port: number
  ): Promise<string> {
    const processError = new Promise<never>((_, reject) => {
      child.on('error', reject);
      child.on('exit', code => {
        // Any exit before port is available is a failure
        reject(
          new Error(
            `Service "${serviceName}" exited with code ${code} before port was available`
          )
        );
      });
    });

    return Promise.race([checkForPort(port, STARTUP_TIMEOUT), processError]);
  }

  // This is needed, because only BuilderV3 exposes a dev server,
  // but we still want to keep dependencies in sync for BuilderV2 (e.g. Next/Vite/etc).
  // We'll try with the provided installCommand (if any) and then fallback
  // to just trying to install dependencnies for Node.
  private async syncDependencies(
    config: Config | undefined,
    workspacePath: string,
    logger: ServiceLogger
  ): Promise<void> {
    logger.stdout.write(`${chalk.gray('Synchronizing dependencies...')}\n`);
    const installCommand =
      typeof config?.installCommand === 'string'
        ? config.installCommand.trim()
        : '';
    if (installCommand) {
      await this.runInstallCommand(installCommand, workspacePath, logger);
    } else {
      await this.maybeInstallJSDependencies(workspacePath, logger);
    }
  }

  private async runBuffered(
    logger: ServiceLogger,
    task: (stdout: Writable, stderr: Writable) => Promise<void>
  ): Promise<void> {
    const captured: Array<['stdout' | 'stderr', Buffer]> = [];
    const bufStdout = new Writable({
      write(chunk, _enc, cb) {
        const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        captured.push(['stdout', b]);
        if (output.debugEnabled) logger.stdout.write(b);
        cb();
      },
    });
    const bufStderr = new Writable({
      write(chunk, _enc, cb) {
        const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        captured.push(['stderr', b]);
        if (output.debugEnabled) logger.stderr.write(b);
        cb();
      },
    });

    try {
      await task(bufStdout, bufStderr);
    } catch (err) {
      for (const [channel, chunk] of captured) {
        logger[channel].write(chunk);
      }
      throw err;
    }
  }

  private async runInstallCommand(
    command: string,
    workspacePath: string,
    logger: ServiceLogger
  ): Promise<void> {
    await this.runBuffered(logger, (stdout, stderr) => {
      return new Promise<void>((resolve, reject) => {
        output.debug(
          `Running install command: "${command}" in ${workspacePath}`
        );
        const child = spawnCommand(command, {
          cwd: workspacePath,
          stdio: ['inherit', 'pipe', 'pipe'],
        });

        child.stdout?.on('data', (chunk: Buffer) => stdout.write(chunk));
        child.stderr?.on('data', (chunk: Buffer) => stderr.write(chunk));

        child.on('error', reject);
        child.on('exit', (code, signal) => {
          if (code === 0) {
            resolve();
          } else {
            reject(
              new NowBuildError({
                code: 'INSTALL_COMMAND_FAILED',
                message: `Install command "${command}" failed with code ${code}, signal ${signal}`,
              })
            );
          }
        });
      });
    });
  }

  private async maybeInstallJSDependencies(
    workspacePath: string,
    logger: ServiceLogger
  ): Promise<void> {
    await this.runBuffered(logger, async (stdout, stderr) => {
      try {
        await runNpmInstall(
          workspacePath,
          [],
          undefined,
          undefined,
          undefined,
          { stdout, stderr }
        );
      } catch (err) {
        throw new NowBuildError({
          code: 'NODE_DEPENDENCY_SYNC_FAILED',
          message: `Failed to install Node.JS dependencies: ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
      }
    });
  }
}
