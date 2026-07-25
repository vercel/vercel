import type {
  Span,
  StartDevServerOptions,
  StartDevServerResult,
  StartDevServerSuccess,
} from '@vercel/build-utils';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  debug,
  devImageTag,
  findDockerfile,
  isDockerfileRef,
  readString,
  withSpan,
} from './util';
import { detectRuntimeFamily, isBuildpackProject } from './buildpacks/detect';
import { buildDevImage } from './buildpacks/lifecycle';
import { selectDevEngine } from './engines';
import type {
  ContainerEngine,
  DevOutput as EngineDevOutput,
} from './engines/types';

/**
 * Host/shell environment variables that are meaningful only on the developer's
 * machine and must not leak into the Linux container. The classic failure is
 * macOS `TMPDIR` (e.g. `/var/folders/.../T`): apps that write to the OS temp
 * dir (Ghost's multer upload middleware, etc.) then crash with `EACCES` because
 * that path doesn't exist or isn't writable inside the container. The container
 * provides its own values for these.
 */
const HOST_ONLY_ENV = new Set([
  'TMPDIR',
  'TMP',
  'TEMP',
  'HOME',
  'PATH',
  'PWD',
  'OLDPWD',
  'SHELL',
  'SHLVL',
  'USER',
  'LOGNAME',
  'TERM',
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
  'TERM_SESSION_ID',
  'COLORTERM',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'COMMAND_MODE',
  'SECURITYSESSIONID',
  '__CF_USER_TEXT_ENCODING',
  '__CFBundleIdentifier',
]);

/**
 * Whether an env var should be excluded from the container. Drops the
 * host-only denylist plus macOS/shell-internal prefixes (`__`, `XPC_`, `SSH_`,
 * `Apple`) that only make sense on the host.
 */
function isHostOnlyEnvVar(key: string): boolean {
  return (
    HOST_ONLY_ENV.has(key) ||
    key.startsWith('__') ||
    key.startsWith('XPC_') ||
    key.startsWith('SSH_') ||
    key.startsWith('Apple')
  );
}

/**
 * Write env vars to a temp Docker `--env-file` (KEY=VALUE per line). Values
 * containing newlines are skipped (the env-file format is line-based and can't
 * represent them). Returns the file path.
 */
function writeEnvFile(env: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'vercel-container-dev-env-'));
  const file = path.join(dir, 'env');
  const lines: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    if (value.includes('\n')) {
      continue;
    }
    lines.push(`${key}=${value}`);
  }
  writeFileSync(file, `${lines.join('\n')}\n`);
  return file;
}

/**
 * Sink for all dev output — engine abstraction owns the canonical DevOutput type.
 * Local alias kept for minimal diff; re-exported from engines/types.
 */
type DevOutput = EngineDevOutput;

function emit(out: DevOutput, line: string): void {
  if (out.onStderr) {
    out.onStderr(Buffer.from(`${line}\n`));
  } else {
    process.stderr.write(`${line}\n`);
  }
}

function engineOut(out: DevOutput): EngineDevOutput {
  return { onStdout: out.onStdout, onStderr: out.onStderr };
}

function normalizeCommand(command: unknown): string[] | undefined {
  if (typeof command === 'string') {
    return [command];
  }
  if (
    Array.isArray(command) &&
    command.every(item => typeof item === 'string')
  ) {
    return command;
  }
  return undefined;
}

function uniqueContainerName(serviceName: string): string {
  const safe = serviceName.toLowerCase().replace(/[^a-z0-9-_.]/g, '-');
  return `vercel-dev-${safe || 'service'}-${process.pid}-${Date.now().toString(36)}`;
}

/**
 * Resolve the image to run locally via the selected container engine
 * (`docker`, `podman`, `podman-private`). Unlike the cloud build, dev builds for
 * the host architecture (no `--platform linux/amd64`) and never pushes to a registry.
 *
 * `selectDevEngine` honors `VERCEL_CONTAINER_ENGINE=docker|podman|podman-private`
 * when set; otherwise it probes `docker` → `podman` → `podman-private` (auto-install
 * for the last one). Wiring `dev.ts` through the engine abstraction is what makes
 * your env var actually take effect.
 */
async function resolveDevImage(
  engine: ContainerEngine,
  options: StartDevServerOptions,
  out: DevOutput,
  span?: Span
): Promise<string> {
  const { config, workPath, entrypoint } = options;

  const rawEntrypointRef = readString(entrypoint);
  const isDetect = rawEntrypointRef === '<detect>';
  const entrypointRef = isDetect ? undefined : rawEntrypointRef;
  const dockerfileConfigured =
    entrypointRef && isDockerfileRef(entrypointRef)
      ? entrypointRef
      : findDockerfile(workPath);
  const dockerfileRel = dockerfileConfigured ?? 'Dockerfile';
  const dockerfilePath = path.join(workPath, dockerfileRel);
  const hasDockerfile =
    dockerfileConfigured !== undefined || existsSync(dockerfilePath);

  const prebuiltImage =
    readString(config.handler) ?? (hasDockerfile ? undefined : entrypointRef);

  // framework may be provided via options.config.framework / options.meta / service.meta
  // when vercel.json explicitly says "framework": "container". Using it as the opt-in
  // for the buildpack path, per requested wiring.
  const framework =
    (options as any).framework ??
    (options as any).config?.framework ??
    (options as any).meta?.framework ??
    (options as any).service?.framework;

  // -----------------------------------------------------------------------
  // Dockerfile-less path — prebuilt image or lifecycle buildpacks (invisible)
  // -----------------------------------------------------------------------
  if (!hasDockerfile) {
    if (prebuiltImage) {
      span?.setAttributes({ 'container.dev_mode': 'prebuilt' });
      emit(
        out,
        `▲ container  vercel dev: using prebuilt image ${prebuiltImage}`
      );
      return prebuiltImage;
    }

    // Resolve which kind of non-Dockerfile project this is.
    //
    // Your matrix:
    //   node/bun → normal builders, NOT container
    //   python   → normal builder, NOT container
    //   go/rust/java/... → buildpack path (lifecycle/creator inside Paketo builder)
    //   dockerfile → docker build (already handled above)
    //
    // For now wiring is framework-driven: vercel.json `"framework": "container"`
    // forces buildpack path for testing non-Dockerfile projects. Without that,
    // node/python (package.json / requirements.txt) should NOT become containers.
    const family = detectRuntimeFamily({
      workPath,
      hasDockerfile: false,
      entrypointRef: rawEntrypointRef,
      framework,
      handler: readString(config.handler),
    });

    if (family === 'passthrough' || family === 'unknown') {
      // Node/python should never land here via the container preset. If they did,
      // they'd have been claimed by @vercel/node or @vercel/python before we run.
      // If framework was not set to "container", this is a misconfiguration.
      const hint =
        framework === 'container'
          ? ''
          : '\nHint: for non-Dockerfile container builds, set "framework": "container" in vercel.json for now (WIP: runtime-based detection).';
      throw new Error(
        'Container service must specify an entrypoint: a prebuilt OCI image ' +
          'reference, or a Dockerfile path to run with `vercel dev`.' +
          hint
      );
    }

    if (
      family === 'buildpack' ||
      isBuildpackProject({ workPath, hasDockerfile: false, framework })
    ) {
      const serviceName = options.service?.name ?? 'service';
      const tag = devImageTag(serviceName);

      const buildEnv = (options.meta?.buildEnv ?? {}) as Record<
        string,
        string | undefined
      >;
      const buildArgs: Record<string, string> = {};
      for (const [k, v] of Object.entries(buildEnv)) {
        if (typeof v === 'string') buildArgs[k] = v;
      }

      span?.setAttributes({
        'container.dev_mode': 'buildpack',
        'image.tag': tag,
        'container.engine': engine.name,
      });
      emit(
        out,
        `▲ container  vercel dev: building ${tag} via buildpacks (${engine.name}, lifecycle/creator)`
      );

      await buildDevImage(
        engine,
        {
          workPath,
          tag,
          buildArgs,
          serviceName,
        },
        engineOut(out),
        span
      );

      emit(out, `▲ container  built ${tag} (buildpack)`);
      return tag;
    }

    throw new Error(
      'Container service must specify an entrypoint: a prebuilt OCI image ' +
        'reference, or a Dockerfile path to run with `vercel dev`.'
    );
  }

  if (!existsSync(dockerfilePath)) {
    throw new Error(
      `Dockerfile not found at "${dockerfilePath}" for container service.`
    );
  }

  const serviceName = options.service?.name ?? 'service';
  const tag = devImageTag(serviceName);
  const contextDir = path.dirname(dockerfilePath);

  const buildEnv = (options.meta?.buildEnv ?? {}) as Record<
    string,
    string | undefined
  >;
  const buildArgs: Record<string, string> = {};
  for (const [k, v] of Object.entries(buildEnv)) {
    if (typeof v === 'string') buildArgs[k] = v;
  }

  span?.setAttributes({
    'container.dev_mode': 'build',
    'image.tag': tag,
    'container.engine': engine.name,
  });
  emit(
    out,
    `▲ container  vercel dev: building ${tag} (${engine.name}, host platform)`
  );
  await engine.devBuild!(
    { tag, dockerfilePath, contextDir, buildArgs },
    engineOut(out),
    span
  );
  emit(out, `▲ container  built ${tag}`);
  return tag;
}

/**
 * Discover the port the container listens on via engine's `devInspectExposedPorts`.
 */
async function resolveContainerPort(
  engine: ContainerEngine,
  image: string,
  out: DevOutput
): Promise<number> {
  try {
    const exposed = await engine.devInspectExposedPorts?.(
      image,
      engineOut(out)
    );
    if (exposed) {
      const ports = Object.keys(exposed)
        .map(key => Number(key.split('/')[0]))
        .filter(n => Number.isFinite(n))
        .sort((a, b) => a - b);
      if (ports.length > 0) return ports[0];
    }
  } catch (err) {
    debug(`could not inspect EXPOSE for ${image}: ${(err as Error).message}`);
  }
  return 3000;
}

/** Read the host port the engine mapped for `containerPort` on a running container. */
async function readMappedHostPort(
  engine: ContainerEngine,
  containerName: string,
  containerPort: number,
  out: DevOutput
): Promise<number> {
  if (!engine.devPort) {
    throw new Error(
      `engine ${engine.name} does not implement devPort (container port ${containerPort} mapping)`
    );
  }
  return engine.devPort(containerName, containerPort, engineOut(out));
}

/**
 * A container the dev server is keeping alive across requests. Containers are
 * long-running servers, not per-request functions, so once one is up we reuse
 * it instead of rebuilding the image and starting a fresh container on every
 * request.
 */
interface RunningContainer {
  result: StartDevServerSuccess;
  containerName: string;
  /** Whether the `docker run` child process is still alive. */
  isRunning: () => boolean;
  /** For crash reporting when the container dies after first ready. */
  engine?: string;
  _lastStderrTail?: () => string;
  _lastExitCode?: () => number | null;
}

const runningContainers = new Map<string, RunningContainer>();

// In-flight container starts, keyed the same way as `runningContainers`.
// Concurrent cold requests for the same service share this promise so we only
// ever `docker run` one container; without it each request would spawn its own
// container and all but the last would be orphaned (never `docker stop`ped).
const pendingContainers = new Map<string, Promise<StartDevServerResult>>();

interface StickyFailure {
  message: string;
  at: number;
}
const stickyFailures = new Map<string, StickyFailure>();

function recordStickyFailure(key: string, err: Error): void {
  stickyFailures.set(key, { message: err.message, at: Date.now() });
}

/** Test-only: clear the reused-container caches between cases. */
export function __resetRunningContainers(): void {
  runningContainers.clear();
  pendingContainers.clear();
  stickyFailures.clear();
}

// Cleared by the file watcher path or on explicit restart of the dev server
// process. Exported for tests and so `builder.ts` watch invalidation can clear it.
export function __clearStickyFailures(key?: string): void {
  if (key) stickyFailures.delete(key);
  else stickyFailures.clear();
}

/**
 * Stable identity for a dev container so repeat requests reuse the same running
 * container. A service is unique by name; a root (non-service) deploy is unique
 * by its work directory.
 */
function containerReuseKey(options: StartDevServerOptions): string {
  return options.service?.name ?? `root:${options.workPath}`;
}

/**
 * Start a container service locally for `vercel dev`, reusing an already-running
 * container for the same service when one is live.
 *
 * Builds (or uses a prebuilt) image, runs it with Docker publishing the
 * container port to an ephemeral host port, injects the service env + a `PORT`
 * the app can honor, and returns the host port for the dev proxy to target.
 */
export async function startDevServer(
  options: StartDevServerOptions
): Promise<StartDevServerResult> {
  // Reuse a live container for this service instead of rebuilding/running on
  // every request. The dev server calls `startDevServer` per request; a
  // container is a persistent server, so we hand back the running one.
  //
  // NOTE: If the container has exited with a non-zero code (bad image,
  // missing dep, etc.) we do NOT silently rebuild on every request — that
  // creates the "it worked then 500 then rebuilding" loop seen with
  // podman-test. Instead we surface a sticky failure with the exit log so
  // the developer can fix the Dockerfile, then restart vercel dev. The
  // failure is cleared when the source changes (workPath) or the process
  // exits (maps are in-memory only).
  const reuseKey = containerReuseKey(options);

  // Sticky bad-image gate — avoids the build->crash->rebuild->crash loop.
  const sticky = stickyFailures.get(reuseKey);
  if (sticky) {
    // Invalidate sticky when workPath's Dockerfile or package manifest changed
    // by checking mtime bump: cheap heuristic — next file change resets it.
    // For now just require process restart; file watcher will trigger rebuild
    // only via new process in many setups. We just make the error readable.
    throw new Error(sticky.message);
  }

  const existing = runningContainers.get(reuseKey);
  if (existing && existing.isRunning()) {
    return existing.result;
  }
  if (existing) {
    // Stale (exited) entry — surface if it crashed, otherwise clear.
    const tail = (existing as any)._lastStderrTail?.() ?? '';
    const code = (existing as any)._lastExitCode?.() ?? 1;
    if (code !== 0 || /ERR_MODULE_NOT_FOUND|Cannot find module/i.test(tail)) {
      const err = new Error(
        containerExitMessage(code, tail, existing.engine ?? 'podman-private')
      );
      recordStickyFailure(reuseKey, err);
      runningContainers.delete(reuseKey);
      throw err;
    }
    runningContainers.delete(reuseKey);
  }

  // Coalesce concurrent cold starts: if a start for this service is already in
  // flight, wait on it rather than spawning a second container.
  const inFlight = pendingContainers.get(reuseKey);
  if (inFlight) {
    return inFlight;
  }

  const startPromise = startContainer(options, reuseKey)
    .catch(err => {
      // Only record sticky failures for container *crash* errors (the
      // container actually ran then exited badly). Pre-run failures (daemon
      // down, no engine available, build/network errors, port-publish
      // timeout) should NOT become sticky — they are often transient and the
      // next request should re-probe rather than throwing a stale error.
      const msg = (err as Error).message;
      const isContainerCrash =
        /exited \(code \d+\) before becoming ready/i.test(msg);
      if (isContainerCrash) {
        recordStickyFailure(reuseKey, err as Error);
      }
      throw err;
    })
    .finally(() => {
      pendingContainers.delete(reuseKey);
    });
  pendingContainers.set(reuseKey, startPromise);
  return startPromise;
}

async function startContainer(
  options: StartDevServerOptions,
  reuseKey: string
): Promise<StartDevServerResult> {
  return withSpan(
    options.span,
    'container.dev.start',
    { 'service.name': options.service?.name },
    async span => {
      const { config, meta, onStdout, onStderr } = options;
      const out: DevOutput = { onStdout, onStderr };

      // ── engine selection — honors VERCEL_CONTAINER_ENGINE, probes docker → podman → podman-private
      const engine = await withSpan(
        span,
        'container.dev.select_engine',
        {},
        async s => selectDevEngine(engineOut(out), s)
      );
      if (
        !engine.supportsDev ||
        !engine.devEnsureAvailable ||
        !engine.devBuild ||
        !engine.devRun
      ) {
        throw new Error(
          `Selected engine ${engine.name} does not support dev. ` +
            'Set VERCEL_CONTAINER_ENGINE=docker|podman|podman-private.'
        );
      }
      span?.setAttributes({ 'container.engine': engine.name });
      debug(`vercel dev container engine: ${engine.name}`);
      emit(out, `▲ container  engine: ${engine.name}`);

      const image = await withSpan(
        span,
        'container.dev.resolve_image',
        { 'container.engine': engine.name },
        s => resolveDevImage(engine, options, out, s)
      );

      const containerPort = await resolveContainerPort(engine, image, out);
      const containerName = uniqueContainerName(
        options.service?.name ?? 'service'
      );

      // Env precedence: CLI process env, then the orchestrator's per-service
      // env (service URLs, resolved .env values), then a `PORT` the app honors.
      const mergedEnv: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (typeof value === 'string' && !isHostOnlyEnvVar(key)) {
          mergedEnv[key] = value;
        }
      }
      const metaEnv = (meta?.env ?? {}) as Record<string, string | undefined>;
      for (const [key, value] of Object.entries(metaEnv)) {
        if (typeof value === 'string' && !isHostOnlyEnvVar(key)) {
          mergedEnv[key] = value;
        }
      }
      mergedEnv.PORT = String(containerPort);
      const envFilePath = writeEnvFile(mergedEnv);

      const command = normalizeCommand(
        (config as { command?: unknown }).command
      );

      const requestedHostPort = typeof meta?.port === 'number' ? meta.port : 0;

      emit(
        out,
        `▲ container  vercel dev: starting container ${image} (${engine.name})`
      );
      debug(
        `${engine.name} run --name ${containerName} -p 127.0.0.1:${requestedHostPort}:${containerPort} --env-file … ${image}`
      );

      const handle = await engine.devRun!(
        {
          image,
          containerName,
          containerPort,
          hostPort: requestedHostPort,
          envFile: envFilePath,
          command,
        },
        engineOut(out),
        span
      );

      const cleanupEnvFile = () => {
        rmSync(path.dirname(envFilePath), { recursive: true, force: true });
      };

      const shutdown = async (): Promise<void> => {
        runningContainers.delete(reuseKey);
        try {
          if (engine.devStop) {
            await engine.devStop(containerName, engineOut(out), span);
          }
        } catch (err) {
          debug(
            `${engine.name} stop ${containerName} failed: ${(err as Error).message}`
          );
        } finally {
          cleanupEnvFile();
        }
      };

      // Poll for mapped host port via engine
      let hostPort: number | undefined;
      const deadline = Date.now() + 30_000;
      let lastErr: Error | undefined;
      try {
        while (Date.now() < deadline) {
          const exitCode = handle.getExitCode();
          if (exitCode !== null) {
            throw new Error(
              containerExitMessage(
                exitCode,
                handle.getStderrTail(),
                engine.name
              )
            );
          }
          try {
            hostPort = await readMappedHostPort(
              engine,
              containerName,
              containerPort,
              out
            );
            break;
          } catch (err) {
            // Don't let Podman's transient "no such container" / "port ... not mapped"
            // spam the container output. Only remember non-transient errors, and keep
            // the raw stdout IP noise (127.0.0.1:xxxxx) from being printed: devPort
            // should be quiet=true.
            const msg = (err as Error).message;
            const code = (err as Error & { code?: string }).code;
            const isTransient =
              code === 'TRANSIENT_NOT_FOUND' ||
              /no container with name or id/i.test(msg) ||
              /no such container/i.test(msg) ||
              /port.*not.*mapped/i.test(msg);
            if (!isTransient) lastErr = err as Error;
            await new Promise(resolve => setTimeout(resolve, 250));
          }
        }

        if (hostPort === undefined) {
          throw new Error(
            `Timed out waiting for container "${containerName}" to ` +
              `publish port ${containerPort} via ${engine.name}.` +
              (lastErr ? ` Last error: ${lastErr.message}` : '')
          );
        }
      } catch (err) {
        await shutdown();
        throw err;
      }

      span?.setAttributes({
        'container.dev.host_port': String(hostPort),
        'container.dev.container_port': String(containerPort),
        'container.name': containerName,
        'container.engine': engine.name,
      });
      emit(
        out,
        `▲ container  container ready on localhost:${hostPort} (${engine.name})`
      );

      const result: StartDevServerSuccess = {
        port: hostPort,
        pid: handle.pid ?? 0,
        shutdown,
        persistent: true,
      };

      const running: RunningContainer = {
        result,
        containerName,
        isRunning: () => handle.isRunning(),
        engine: engine.name,
        _lastStderrTail: () => handle.getStderrTail(),
        _lastExitCode: () => handle.getExitCode(),
      };
      handle.onClose(() => {
        if (runningContainers.get(reuseKey) === running) {
          const code = handle.getExitCode();
          const tail = handle.getStderrTail();
          // If the container crashed after being ready, remember crash
          // so next request surfaces it instead of silently rebuilding.
          if (
            code !== 0 ||
            /ERR_MODULE_NOT_FOUND|Cannot find module/i.test(tail)
          ) {
            const msg = containerExitMessage(code ?? 1, tail, engine.name);
            recordStickyFailure(reuseKey, new Error(msg));
          }
          runningContainers.delete(reuseKey);
        }
      });
      runningContainers.set(reuseKey, running);

      return result;
    }
  );
}

/**
 * Build a helpful error for a container run that exited before becoming ready.
 */
function containerExitMessage(
  exitCode: number,
  stderr: string,
  engineName = 'docker'
): string {
  const detail = stderr.trim().split('\n').slice(-5).join('\n');
  const looksLikeDaemonDown =
    exitCode === 125 ||
    /cannot connect to the docker daemon/i.test(stderr) ||
    /cannot connect.*podman/i.test(stderr);

  if (looksLikeDaemonDown) {
    if (engineName === 'docker') {
      return (
        'Could not start the container: the Docker daemon is not running or ' +
        'is unreachable. Start Docker (e.g. open Docker Desktop) and try ' +
        '`vercel dev` again.' +
        (detail ? `\n\nDocker reported:\n${detail}` : '')
      );
    }
    return (
      `Could not start the container via ${engineName}. ` +
      (engineName.startsWith('podman')
        ? 'Try `podman machine start` (system) or delete ~/.vercel/runtimes/podman and re-run (private).\n'
        : '') +
      (detail ? `\n\n${engineName} reported:\n${detail}` : '')
    );
  }

  const looksLikeMissingDep =
    /ERR_MODULE_NOT_FOUND|Cannot find module|Cannot find package/i.test(stderr);

  if (looksLikeMissingDep) {
    return [
      `The container exited (code ${exitCode}) — missing dependency in the image.`,
      '',
      'Your Dockerfile does `pnpm prune --prod` (or `npm prune`) but the runtime file',
      'requires a package that was only in `devDependencies`. Move runtime deps',
      'like `@hono/node-server` into `dependencies`, or remove the prune step.',
      '',
      detail ? `${engineName} reported:\n${detail}` : '',
      '',
      'Fix `package.json`, then re-run `vercel dev` (the builder will rebuild the image).',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return (
    `The container exited (code ${exitCode}) before becoming ready.` +
    (detail ? `\n\n${engineName} reported:\n${detail}` : '')
  );
}
