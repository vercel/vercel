import { spawn } from 'node:child_process';
import type { Span } from '@vercel/build-utils';
import {
  DEBUG,
  debug,
  done,
  extractField,
  info,
  isBuildContainer,
  run,
  step,
  toTag,
  withSpan,
} from '../../util';
import { selectStorageDriver } from '../../storage-driver';
import type {
  BuildPushParams,
  ContainerEngine,
  DevBuildParams,
  DevRunParams,
  DevOutput,
} from '../types';
import { TARGET_PLATFORM, buildArgFlags } from '../types';
import { formatVcrAuthError } from '../../oidc';

// Lazy import of private helpers — private.ts does not import from podman.ts,
// so there is no cycle. We keep a dynamic import wrapper to avoid eagerly
// pulling in Node fs helpers used for vendoring when the system engine is used.
async function privateHelpers() {
  return await import('./private');
}

// ---------------------------------------------------------------------------
// Factory options — lets podman and podman-private share the same impl.
// ---------------------------------------------------------------------------

export interface PodmanEngineOptions {
  /** Binary path or lazy getter (private bin resolves via symlink). */
  bin: string | (() => string);
  /** Env override or lazy getter. System engine omits this (inherits process.env). */
  env?: NodeJS.ProcessEnv | (() => NodeJS.ProcessEnv | undefined);
  /** Machine name on macOS. System: podman-machine-default (or first machine); private: vercel */
  machineName?: string;
  /** When true: isolated XDG dirs, honest sizing output, never touches user's machines. */
  isolated?: boolean;
  /** Engine name reported in logs/spans. Default podman / podman-private. */
  displayName?: string;
}

function resolveBin(opts: PodmanEngineOptions): string {
  return typeof opts.bin === 'function'
    ? (opts.bin as () => string)()
    : opts.bin;
}
function resolveEnv(opts: PodmanEngineOptions): NodeJS.ProcessEnv | undefined {
  if (!opts.env) return undefined;
  return typeof opts.env === 'function'
    ? (opts.env as () => NodeJS.ProcessEnv | undefined)()
    : opts.env;
}
function resolveMachineName(opts: PodmanEngineOptions): string {
  return opts.machineName ?? 'podman-machine-default';
}

function runPodman(
  opts: PodmanEngineOptions,
  args: string[],
  runOpts: { input?: string; quiet?: boolean } = {}
) {
  const bin = resolveBin(opts);
  const env = resolveEnv(opts);
  debug(`exec: ${bin} ${args.join(' ')}${opts.isolated ? ' [private]' : ''}`);
  return run(bin, args, { ...runOpts, env });
}

function spawnPodman(
  opts: PodmanEngineOptions,
  args: string[],
  spawnOpts: {
    stdio: [string | null, string | null, string | null];
  }
) {
  const bin = resolveBin(opts);
  const env = resolveEnv(opts) ?? process.env;
  return spawn(bin, args, {
    stdio: spawnOpts.stdio as any,
    env,
  });
}

// ---------------------------------------------------------------------------
// Machine probes — parameterized by bin/env/machineName/isolated
// ---------------------------------------------------------------------------

async function isPodmanMachineRunningOpt(
  opts: PodmanEngineOptions
): Promise<boolean> {
  try {
    await runPodman(opts, ['info', '--format', '{{.Host.Security.Rootless}}'], {
      quiet: true,
    });
    return true;
  } catch {
    // secondary check from machine list (works for private isolated env where info may fail transiently)
    try {
      const bin = resolveBin(opts);
      const env = resolveEnv(opts);
      const { stdout } = await run(
        bin,
        ['machine', 'list', '--format', 'json'],
        {
          quiet: true,
          env,
        }
      );
      const trimmed = stdout.trim();
      if (!trimmed) return false;
      try {
        const arr = JSON.parse(trimmed);
        const machines: Array<{
          Name: string;
          Running: boolean;
          Starting?: boolean;
        }> = Array.isArray(arr) ? arr : [arr];
        return machines.some(m => m.Running || m.Starting);
      } catch {
        // newline-delimited json fallback
        for (const line of trimmed.split('\n')) {
          try {
            const m = JSON.parse(line);
            if (m.Running || m.Starting) return true;
          } catch {}
        }
        return false;
      }
    } catch {
      return false;
    }
  }
}

async function ensurePodmanMachineOpt(
  opts: PodmanEngineOptions,
  out?: DevOutput,
  span?: Span
): Promise<void> {
  if (process.platform !== 'darwin') return;

  if (opts.isolated) {
    // Delegates to private runtime's machine manager so single source of truth
    // for AppleHV args, disk sizing copy, and honest output.
    const helpers = await privateHelpers();
    await helpers.ensurePrivateMachine(out as any, span);
    return;
  }

  // System podman path (existing behavior).
  try {
    const bin = resolveBin(opts);
    const env = resolveEnv(opts);
    const { stdout } = await run(bin, ['machine', 'list', '--format', 'json'], {
      quiet: true,
      env,
    });
    const machines = JSON.parse(stdout || '[]') as Array<{
      Name: string;
      Running: boolean;
      Starting?: boolean;
    }>;
    const running = machines.some(m => m.Running || m.Starting);
    if (running) return;

    const target = machines[0]?.Name ?? resolveMachineName(opts);
    step(`Starting Podman machine (${target})`);
    await run(bin, ['machine', 'start', target], { quiet: false, env });
    done(`Podman machine ${target} ready`);
    return;
  } catch (err) {
    debug(`podman machine list/start failed: ${(err as Error).message}`);

    try {
      const bin = resolveBin(opts);
      const env = resolveEnv(opts);
      step('Initializing Podman machine (rootless, first run)');
      await run(bin, ['machine', 'init', '--rootful=false'], {
        quiet: false,
        env,
      });
      await run(bin, ['machine', 'start'], { quiet: false, env });
      done('Podman machine initialized and started');
    } catch (initErr) {
      debug(`podman machine init failed: ${(initErr as Error).message}`);
      throw new Error(
        [
          'Podman is installed but no machine is running and automatic init failed.',
          '',
          'On macOS Podman runs inside a lightweight Linux VM. Initialize and start it:',
          '  podman machine init --rootful=false',
          '  podman machine start',
          '',
          'Then re-run `vercel dev`. Alternatively, use Docker/OrbStack (docker) or',
          'Apple Container (macOS 26+, `container system start`).',
          '',
          `Underlying error: ${(err as Error).message}`,
        ].join('\n')
      );
    }
  }
}

async function withManagedMachineOpt<T>(
  opts: PodmanEngineOptions,
  fn: () => Promise<T>,
  out?: DevOutput,
  span?: Span
): Promise<T> {
  if (process.platform === 'darwin' && !isBuildContainer()) {
    const running = await isPodmanMachineRunningOpt(opts);
    if (!running) {
      await ensurePodmanMachineOpt(opts, out, span);
    }
  }
  return fn();
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPodmanEngine(
  engineOpts: PodmanEngineOptions
): ContainerEngine {
  const name =
    engineOpts.displayName ??
    (engineOpts.isolated ? 'podman-private' : 'podman');
  const machineName = resolveMachineName(engineOpts);

  const engine: ContainerEngine = {
    name,
    supportsDev: true,

    async ensureReady(span?: Span): Promise<void> {
      const bin = resolveBin(engineOpts);
      const env = resolveEnv(engineOpts);
      try {
        const { stdout } = await run(bin, ['--version'], { quiet: true, env });
        span?.setAttributes({
          [`${name}.version`]: stdout.trim(),
          'podman.bin': bin,
          'podman.isolated': toTag(Boolean(engineOpts.isolated)),
          'podman.machine': machineName,
        });
      } catch (err) {
        const msg = (err as Error).message;
        if (/Command not found/i.test(msg)) {
          if (engineOpts.isolated) {
            throw new Error(
              `Private podman runtime not found at ${bin}. ` +
                `Run with VERCEL_CONTAINER_ENGINE=podman-private on a machine that has first installed ` +
                `via ensurePrivatePodmanInstalled, or set VERCEL_PODMAN_ASSET_URL to auto-install.`
            );
          }
          throw new Error(
            'Podman was not found on your PATH. Install Podman to use it as a container runtime:\n' +
              '  macOS:     brew install podman && podman machine init --rootful=false && podman machine start\n' +
              '  Linux:     your package manager (e.g. `sudo apt install podman`)\n' +
              'Or set VERCEL_CONTAINER_ENGINE=docker to use Docker/OrbStack, or podman-private for vendored runtime.'
          );
        }
        throw err;
      }

      if (process.platform === 'darwin' && !isBuildContainer()) {
        const running = await isPodmanMachineRunningOpt(engineOpts);
        if (!running) {
          await ensurePodmanMachineOpt(engineOpts, undefined, span);
          if (!(await isPodmanMachineRunningOpt(engineOpts))) {
            throw new Error(
              [
                engineOpts.isolated
                  ? `Private podman machine "${machineName}" is not running.`
                  : 'Podman machine is not running.',
                '',
                engineOpts.isolated
                  ? `Inspect it with: ${bin} machine list  (isolated env: XDG_DATA_HOME=${env?.XDG_DATA_HOME})`
                  : 'Start it with:\n  podman machine start',
                '',
                engineOpts.isolated
                  ? `Or re-create: ${bin} machine rm -f ${machineName} && vercel dev`
                  : 'Or create one for the first time:\n  podman machine init --rootful=false\n  podman machine start',
              ].join('\n')
            );
          }
        }
      }

      try {
        await runPodman(
          engineOpts,
          ['info', '--format', '{{.Version.Version}}'],
          {
            quiet: true,
          }
        );
      } catch (err) {
        throw new Error(
          `Podman is installed but not reachable: ${(err as Error).message}\n` +
            (engineOpts.isolated
              ? `Try: ${resolveBin(engineOpts)} info (isolated env) to diagnose.`
              : 'Try `podman machine start` (macOS) or `podman info` to diagnose.')
        );
      }
    },

    async logDiagnostics(span?: Span): Promise<void> {
      try {
        const [version, podmanInfo] = await Promise.all([
          runPodman(engineOpts, ['version'], { quiet: true })
            .then(r => r.stdout)
            .catch(() => ''),
          runPodman(engineOpts, ['info'], { quiet: true })
            .then(r => r.stdout)
            .catch(() => ''),
        ]);

        const clientVersion =
          extractField(version, 'Version') ?? extractField(version, 'Client');
        const serverVersion = extractField(
          version.split(/^Server:/m)[1] ?? '',
          'Version'
        );
        const storageDriver =
          extractField(podmanInfo, 'graphDriverName') ??
          extractField(podmanInfo, 'driver');
        const rootless = extractField(podmanInfo, 'rootless');

        info(
          `${name}: client=${clientVersion ?? '?'} server=${serverVersion ?? '?'} ` +
            `storage-driver=${storageDriver ?? '?'} rootless=${rootless ?? '?'}`
        );
        debug(`--- ${name} version ---\n${version.trim()}`);

        span?.setAttributes({
          'container.engine': name,
          'podman.bin': resolveBin(engineOpts),
          'podman.client_version': toTag(clientVersion),
          'podman.server_version': toTag(serverVersion),
          'podman.storage_driver': toTag(storageDriver),
          'podman.rootless': toTag(rootless),
        });

        selectStorageDriver()
          .then(d => debug(`local storage probe: ${d ?? 'storage.conf'}`))
          .catch(() => {});
      } catch (err) {
        debug(`${name} diagnostics unavailable: ${(err as Error).message}`);
      }
    },

    async withRuntime<T>(
      _span: Span | undefined,
      fn: () => Promise<T>
    ): Promise<T> {
      return withManagedMachineOpt(engineOpts, fn);
    },

    // -----------------------------------------------------------------------
    // Cloud build path — symmetric to buildah for testing / forced usage.
    // -----------------------------------------------------------------------

    async build(params: BuildPushParams): Promise<void> {
      await runPodman(engineOpts, [
        'build',
        '--platform',
        TARGET_PLATFORM,
        ...buildArgFlags(params),
        '-t',
        params.imageRef,
        '-f',
        params.dockerfilePath,
        params.contextDir,
      ]);
    },

    async login(params: BuildPushParams): Promise<void> {
      try {
        await runPodman(
          engineOpts,
          [
            'login',
            params.registry,
            '--username',
            params.username,
            '--password-stdin',
          ],
          { input: params.token, quiet: !DEBUG }
        );
      } catch (err) {
        const message = (err as Error).message;
        if (/denied|forbidden|unauthorized|401|403/i.test(message)) {
          throw new Error(
            formatVcrAuthError(
              params.registry,
              params.username,
              `Underlying error: ${message}`
            )
          );
        }
        throw err;
      }
    },

    async push(params: BuildPushParams): Promise<string | undefined> {
      try {
        info(`pushing ${params.imageRef} (${name})`);
        const pushStart = Date.now();
        const { stdout } = await runPodman(engineOpts, [
          'push',
          params.imageRef,
        ]);
        debug(`push completed in ${Date.now() - pushStart}ms`);
        let digest = stdout.match(/sha256:[a-f0-9]{64}/)?.[0];
        if (!digest) {
          const bin = resolveBin(engineOpts);
          const env = resolveEnv(engineOpts);
          const inspect = await run(
            bin,
            [
              'inspect',
              '--format',
              '{{index .RepoDigests 0}}',
              params.imageRef,
            ],
            { quiet: true, env }
          );
          digest = inspect.stdout.match(/sha256:[a-f0-9]{64}/)?.[0];
        }
        return digest;
      } catch (err) {
        const message = (err as Error).message;
        if (
          /denied|forbidden|unauthorized|not found|401|403|404/i.test(message)
        ) {
          throw new Error(
            [
              `Pushing ${params.imageRef} was denied.`,
              '',
              `The build tried to ensure the "${params.repository}" repository exists, but`,
              'the push was still rejected. Verify access (or create the repository under',
              "your project's Sandboxes → Container Registry tab), then re-run the build.",
              '',
              `Underlying error: ${message}`,
            ].join('\n')
          );
        }
        throw err;
      }
    },

    // -----------------------------------------------------------------------
    // Dev path
    // -----------------------------------------------------------------------

    async devEnsureAvailable(out?: DevOutput, span?: Span): Promise<void> {
      return withSpan(span, `container.${name}.ensure`, {}, async s => {
        // For isolated (private) mode we auto-install the vendored binary + machine
        // before probing ensureReady, so `vercel dev` can succeed on a clean machine.
        if (engineOpts.isolated) {
          const helpers = await privateHelpers();
          await helpers.ensurePrivatePodmanInstalled(out as DevOutput, s);
          await helpers.ensurePrivateMachine(out as DevOutput, s);
        }
        await (engine as ContainerEngine).ensureReady(s);
      });
    },

    async devBuild(
      params: DevBuildParams,
      out?: DevOutput,
      _span?: Span
    ): Promise<void> {
      const buildArgs: string[] = [];
      for (const [k, v] of Object.entries(params.buildArgs ?? {})) {
        buildArgs.push('--build-arg', `${k}=${v}`);
      }
      if (out?.onStdout || out?.onStderr) {
        await new Promise<void>((resolve, reject) => {
          const args = [
            'build',
            ...buildArgs,
            '-t',
            params.tag,
            '-f',
            params.dockerfilePath,
            params.contextDir,
          ];
          const child = spawnPodman(engineOpts, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          let stderr = '';
          child.stdout?.on('data', (c: Buffer) => {
            if (out.onStdout) out.onStdout(c);
            else process.stderr.write(c as unknown as Uint8Array);
          });
          child.stderr?.on('data', (c: Buffer) => {
            stderr += c.toString();
            if (out.onStderr) out.onStderr(c);
            else process.stderr.write(c as unknown as Uint8Array);
          });
          child.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'ENOENT') {
              reject(
                new Error(
                  `Command not found: \`${resolveBin(engineOpts)}\`. ` +
                    (engineOpts.isolated
                      ? 'Private runtime missing — delete ~/.vercel/runtimes/podman and re-run vercel dev to reinstall.'
                      : 'Install Podman or set VERCEL_CONTAINER_ENGINE=docker.')
                )
              );
              return;
            }
            reject(err);
          });
          child.on('close', code => {
            if (code === 0) resolve();
            else {
              const tail = stderr.trim().split('\n').slice(-5).join('\n');
              reject(
                new Error(
                  `\`${resolveBin(engineOpts)} build\` exited ${code}` +
                    (tail ? `\n${tail}` : '')
                )
              );
            }
          });
        });
        return;
      }
      await runPodman(engineOpts, [
        'build',
        ...buildArgs,
        '-t',
        params.tag,
        '-f',
        params.dockerfilePath,
        params.contextDir,
      ]);
    },

    async devInspectExposedPorts(
      image: string,
      out?: DevOutput,
      _span?: Span
    ): Promise<Record<string, unknown> | null> {
      void out;
      try {
        const bin = resolveBin(engineOpts);
        const env = resolveEnv(engineOpts);
        const { stdout } = await run(
          bin,
          [
            'image',
            'inspect',
            '--format',
            '{{json .Config.ExposedPorts}}',
            image,
          ],
          { quiet: true, env }
        );
        return (
          (JSON.parse(stdout.trim() || 'null') as Record<
            string,
            unknown
          > | null) ?? null
        );
      } catch {
        return null;
      }
    },

    async devRun(
      params: DevRunParams,
      out?: DevOutput,
      _span?: Span
    ): Promise<{
      pid?: number;
      isRunning: () => boolean;
      onClose: (cb: () => void) => void;
      getStderrTail: () => string;
      getExitCode: () => number | null;
    }> {
      // Docker accepts `-p 127.0.0.1:0:3000` for a random host port;
      // Podman requires `-p 127.0.0.1::3000` (empty host port) for that.
      // dev.ts passes hostPort=0 when the framework didn't request a fixed port.
      const publish =
        params.hostPort === 0 || params.hostPort === undefined
          ? `127.0.0.1::${params.containerPort}`
          : `127.0.0.1:${params.hostPort}:${params.containerPort}`;
      const args = [
        'run',
        '--rm',
        '--name',
        params.containerName,
        '-p',
        publish,
        '--env-file',
        params.envFile,
      ];

      if (params.command?.length) {
        args.push(params.image, ...params.command);
      } else {
        args.push(params.image);
      }

      debug(`exec: ${resolveBin(engineOpts)} ${args.join(' ')}`);

      const child = spawnPodman(engineOpts, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      child.stdout?.on('data', (c: Buffer) => {
        if (out?.onStdout) out.onStdout(c);
      });
      child.stderr?.on('data', (c: Buffer) => {
        stderr += c.toString();
        if (out?.onStderr) out.onStderr(c);
      });
      child.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          stderr +=
            `Command not found: \`${resolveBin(engineOpts)}\`. ` +
            (engineOpts.isolated
              ? 'Private runtime missing.'
              : 'Install Podman or set VERCEL_CONTAINER_ENGINE=docker.');
        } else {
          stderr += (err as Error).message;
        }
      });

      return {
        pid: child.pid,
        isRunning: () =>
          (child as any).exitCode == null && (child as any).signalCode == null,
        onClose: (cb: () => void) => {
          child.on('close', cb);
        },
        getStderrTail: () => stderr,
        getExitCode: () => (child as any).exitCode ?? null,
      };
    },

    async devPort(
      containerName: string,
      containerPort: number,
      out?: DevOutput,
      _span?: Span
    ): Promise<number> {
      void out;
      try {
        const { stdout } = await runPodman(
          engineOpts,
          ['port', containerName, `${containerPort}/tcp`],
          { quiet: true }
        );
        const m = stdout.match(/:(\d+)\s*$/m);
        if (!m) {
          throw new Error(
            `Could not determine mapped host port for ${containerName} (${containerPort}/tcp). Got: ${stdout.trim()}`
          );
        }
        return Number(m[1]);
      } catch (err) {
        const msg = (err as Error).message;
        // Podman can transiently report "no such container" right after `podman run`
        // even though the container is starting - dev.ts will retry this.
        if (
          /no container with name or id/i.test(msg) ||
          /no such container/i.test(msg)
        ) {
          const e = err as Error & { code?: string };
          e.code = 'TRANSIENT_NOT_FOUND';
          throw e;
        }
        throw err;
      }
    },

    async devStop(
      containerName: string,
      out?: DevOutput,
      _span?: Span
    ): Promise<void> {
      void out;
      try {
        await runPodman(engineOpts, ['stop', containerName], { quiet: true });
      } catch (err) {
        debug(
          `${name} stop ${containerName} failed: ${(err as Error).message}`
        );
      }
    },
  };

  return engine;
}

// ---------------------------------------------------------------------------
// Default system engine (back-compat export)
// ---------------------------------------------------------------------------

export const podmanEngine: ContainerEngine = createPodmanEngine({
  bin: 'podman',
  machineName: 'podman-machine-default',
  isolated: false,
  displayName: 'podman',
});

// Lazy private engine — bin/env resolved on each call so pre-install probes
// don't hard-capture a non-existent path.
export function getPrivatePodmanEngine(): ContainerEngine {
  // Dynamically resolve helpers so this module never requires fs-heavy helpers
  // when only the system engine is used.
  const binGetter = () => {
    try {
      // synchronously resolve from private helper without async import to keep
      // spawn hot-path fast; privateBin() never touches async fs.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { privateBin } = require('./private') as typeof import('./private');
      return privateBin();
    } catch {
      return 'podman';
    }
  };
  const envGetter = () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { privateEnv } = require('./private') as typeof import('./private');
      return privateEnv();
    } catch {
      return undefined;
    }
  };
  return createPodmanEngine({
    bin: binGetter,
    env: envGetter,
    machineName: 'vercel',
    isolated: true,
    displayName: 'podman-private',
  });
}

// Re-export helpers for index.ts probing without circular imports.
export {
  privateBin,
  privateEnv,
  privateRoot,
  privateMachineName,
  ensurePrivatePodmanInstalled,
  ensurePrivateMachine,
  isPrivateMachineRunning,
} from './private';
