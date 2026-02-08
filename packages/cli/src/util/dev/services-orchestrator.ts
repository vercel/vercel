import path from 'path';
import ms from 'ms';
import { Transform, type TransformCallback } from 'stream';
import type { ChildProcess } from 'child_process';
import getPort from 'get-port';
import chalk from 'chalk';
import type { Service } from '@vercel/fs-detectors';
import { frameworkList, type Framework } from '@vercel/frameworks';
import {
  cloneEnv,
  getNodeBinPaths,
  spawnCommand,
  type BuilderV3,
} from '@vercel/build-utils';
import { checkForPort } from './port-utils';
import { importBuilders } from '../build/import-builders';
import output from '../../output-manager';
import { treeKill } from '../tree-kill';

const STARTUP_TIMEOUT = ms('5m');

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

  const createTransform = () =>
    new Transform({
      transform(
        chunk: Buffer,
        _encoding: BufferEncoding,
        callback: TransformCallback
      ) {
        const text = chunk.toString();
        const lines = text.split('\n');
        const prefixed = lines
          .map((line, index) => {
            if (index === lines.length - 1 && line === '') {
              return '';
            }
            return `${prefix} ${line}`;
          })
          .join('\n');
        callback(null, prefixed);
      },
    });

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

  constructor(options: ServicesOrchestratorOptions) {
    this.services = options.services;
    this.cwd = options.cwd;
    this.repoRoot = options.repoRoot;
    this.maxNameLength = Math.max(...options.services.map(s => s.name.length));
    this.proxyOrigin = options.proxyOrigin;
    this.env = options.env;
  }

  async startAll(): Promise<void> {
    output.debug(`Starting ${this.services.length} services`);

    const startPromises = this.services.map((service, index) =>
      this.startService(service, index)
    );

    try {
      const results = await Promise.all(startPromises);
      for (const result of results) {
        this.managedServices.set(result.name, result);
      }
      output.debug(
        `All ${this.managedServices.size} services started successfully`
      );
    } catch (error) {
      output.error(`${error}`);
      await this.stopAll();
      throw error;
    }
  }

  async stopAll(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;

    const totalCount = this.managedServices.size + this.managedProcesses.size;
    output.debug(`Stopping ${totalCount} services/processes`);

    const stopPromises: Promise<void>[] = [];

    for (const [name, service] of this.managedServices) {
      output.debug(`Stopping service "${name}" (PID: ${service.pid})`);

      if (service.shutdown) {
        stopPromises.push(
          service.shutdown().catch(err => {
            output.debug(`Failed to shutdown service "${name}": ${err}`);
          })
        );
      } else if (service.pid) {
        stopPromises.push(
          treeKill(service.pid).catch(err => {
            output.debug(`Failed to stop service "${name}": ${err}`);
          })
        );
      }

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

    const serviceUrlEnvVars = this.generateServiceUrlEnvVars(
      framework?.envPrefix
    );

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
      const result = await builder.startDevServer({
        entrypoint,
        workPath: workspacePath,
        repoRootPath: this.repoRoot,
        config: { framework: service.framework },
        meta: {
          isDev: true,
          env,
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

  private generateServiceUrlEnvVars(
    envPrefix?: string
  ): Record<string, string> {
    const envVars: Record<string, string> = {};

    for (const service of this.services) {
      const { name, routePrefix } = service;
      if (!routePrefix) continue;

      const baseName = name.toUpperCase().replace(/-/g, '_');
      const key = envPrefix ? `${envPrefix}${baseName}_URL` : `${baseName}_URL`;

      const url =
        routePrefix === '/'
          ? this.proxyOrigin
          : `${this.proxyOrigin}${routePrefix.startsWith('/') ? '' : '/'}${routePrefix}`;

      envVars[key] = url;
    }

    return envVars;
  }
}
