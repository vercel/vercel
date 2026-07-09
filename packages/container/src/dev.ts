import type {
  Span,
  StartDevServerOptions,
  StartDevServerResult,
  StartDevServerSuccess,
} from '@vercel/build-utils';
import { spawn } from 'node:child_process';
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
 * Sink for all dev output. `vercel dev` runs many services in parallel and
 * prefixes each service's logs (e.g. `[api]`) by piping through per-service
 * `onStdout`/`onStderr` callbacks. So in dev we must route ALL output
 * (status lines, `docker build`, the container) through these callbacks rather
 * than writing to `process.stderr` directly (which would print unprefixed and
 * interleave with other services).
 */
interface DevOutput {
  onStdout?: (data: Buffer) => void;
  onStderr?: (data: Buffer) => void;
}

function emit(out: DevOutput, line: string): void {
  if (out.onStderr) {
    out.onStderr(Buffer.from(`${line}\n`));
  } else {
    process.stderr.write(`${line}\n`);
  }
}

/**
 * Run a command to completion, forwarding its stdout/stderr to the dev output
 * sink so it gets the per-service log prefix. Resolves stdout for parsing.
 */
function runForwarded(
  cmd: string,
  args: string[],
  out: DevOutput,
  opts: { quiet?: boolean } = {}
): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (!opts.quiet) {
        if (out.onStdout) {
          out.onStdout(chunk);
        } else {
          process.stderr.write(chunk.toString());
        }
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (!opts.quiet) {
        if (out.onStderr) {
          out.onStderr(chunk);
        } else {
          process.stderr.write(chunk.toString());
        }
      }
    });
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(
          new Error(
            `Command not found: \`${cmd}\`. Ensure \`${cmd}\` is installed ` +
              'and on your PATH (Docker is required for `vercel dev` with ' +
              'container services).'
          )
        );
        return;
      }
      reject(err);
    });
    child.on('close', code => {
      if (code === 0) {
        resolve({ stdout });
      } else {
        const detail = stderr.trim().split('\n').slice(-5).join('\n');
        reject(
          new Error(
            `\`${cmd} ${args.join(' ')}\` exited with code ${code}` +
              (detail ? `\n${detail}` : '')
          )
        );
      }
    });
  });
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

/**
 * Resolve the image to run locally: either a configured prebuilt image, or one
 * built locally from the service's Dockerfile.
 *
 * Unlike the cloud build, dev builds for the host architecture (no
 * `--platform linux/amd64`) and never pushes to a registry.
 */
async function resolveDevImage(
  options: StartDevServerOptions,
  out: DevOutput,
  span?: Span
): Promise<string> {
  const { config, workPath, entrypoint } = options;

  const entrypointRef = readString(entrypoint);
  // An entrypoint that names a Dockerfile (including the `Dockerfile.vercel` /
  // `Containerfile.vercel` opt-in markers) is built directly. Otherwise — e.g.
  // when the `container` framework preset resolves its entrypoint via
  // `<detect>` — discover an opt-in marker in the work directory. This mirrors
  // the build path (`resolveImageHandler`) so dev and deploy resolve the same
  // Dockerfile.
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

  if (!hasDockerfile) {
    if (!prebuiltImage) {
      throw new Error(
        'Container service must specify an entrypoint: a prebuilt OCI image ' +
          'reference, or a Dockerfile path to run with `vercel dev`.'
      );
    }
    span?.setAttributes({ 'container.dev_mode': 'prebuilt' });
    emit(out, `▲ container  vercel dev: using prebuilt image ${prebuiltImage}`);
    return prebuiltImage;
  }

  if (!existsSync(dockerfilePath)) {
    throw new Error(
      `Dockerfile not found at "${dockerfilePath}" for container service.`
    );
  }

  const serviceName = options.service?.name ?? 'service';
  const tag = devImageTag(serviceName);
  const contextDir = path.dirname(dockerfilePath);

  // Forward the project build env as `--build-arg`s so Dockerfile `ARG`s work
  // in dev too, matching the cloud build.
  const buildArgFlags: string[] = [];
  const buildEnv = (options.meta?.buildEnv ?? {}) as Record<
    string,
    string | undefined
  >;
  for (const [key, value] of Object.entries(buildEnv)) {
    if (typeof value === 'string') {
      buildArgFlags.push('--build-arg', `${key}=${value}`);
    }
  }

  span?.setAttributes({ 'container.dev_mode': 'build', 'image.tag': tag });
  emit(out, `▲ container  vercel dev: building ${tag} (docker, host platform)`);
  // No `--platform`: build for the developer's native architecture.
  await runForwarded(
    'docker',
    ['build', ...buildArgFlags, '-t', tag, '-f', dockerfilePath, contextDir],
    out
  );
  emit(out, `▲ container  built ${tag}`);
  return tag;
}

/**
 * Discover the port the container listens on, without modifying the user's
 * Dockerfile:
 *   1. the image's first `EXPOSE`d port, else
 *   2. fall back to 3000.
 *
 * Either way we inject `PORT=<this>` into the container, so apps that honor
 * `process.env.PORT` (the standard Vercel contract) bind the right port; the
 * `EXPOSE` lookup additionally covers apps that hardcode a port.
 */
async function resolveContainerPort(
  image: string,
  out: DevOutput
): Promise<number> {
  try {
    const { stdout } = await runForwarded(
      'docker',
      ['image', 'inspect', '--format', '{{json .Config.ExposedPorts}}', image],
      out,
      { quiet: true }
    );
    const exposed = JSON.parse(stdout.trim() || 'null') as Record<
      string,
      unknown
    > | null;
    if (exposed) {
      // Keys look like "3000/tcp"; pick the lowest tcp port.
      const ports = Object.keys(exposed)
        .map(key => Number(key.split('/')[0]))
        .filter(n => Number.isFinite(n))
        .sort((a, b) => a - b);
      if (ports.length > 0) {
        return ports[0];
      }
    }
  } catch (err) {
    debug(`could not inspect EXPOSE for ${image}: ${(err as Error).message}`);
  }

  return 3000;
}

/** Read the host port Docker mapped for `containerPort` on a running container. */
async function readMappedHostPort(
  containerName: string,
  containerPort: number,
  out: DevOutput
): Promise<number> {
  const { stdout } = await runForwarded(
    'docker',
    ['port', containerName, `${containerPort}/tcp`],
    out,
    { quiet: true }
  );
  // Output like "0.0.0.0:54321" (possibly multiple lines for ipv4/ipv6).
  const match = stdout.match(/:(\d+)\s*$/m);
  if (!match) {
    throw new Error(
      `Could not determine mapped host port for ${containerName} ` +
        `(${containerPort}/tcp). Got: ${stdout.trim()}`
    );
  }
  return Number(match[1]);
}

function uniqueContainerName(serviceName: string): string {
  const safe = serviceName.toLowerCase().replace(/[^a-z0-9-_.]/g, '-');
  return `vercel-dev-${safe || 'service'}-${process.pid}-${Date.now().toString(36)}`;
}

/**
 * Verify the Docker daemon is installed and reachable before doing any build
 * or run work, so the user gets one clear message instead of a cryptic exit
 * code from whichever Docker command happened to run first. `docker info`
 * connects to the daemon and exits non-zero (125) when it can't.
 */
async function assertDockerAvailable(out: DevOutput): Promise<void> {
  try {
    await runForwarded(
      'docker',
      ['info', '--format', '{{.ServerVersion}}'],
      out,
      {
        quiet: true,
      }
    );
  } catch (err) {
    const message = (err as Error).message ?? '';
    if (/command not found/i.test(message)) {
      throw new Error(
        'Docker is required for `vercel dev` with containers, but the ' +
          '`docker` command was not found. Install Docker and ensure it is ' +
          'on your PATH.'
      );
    }
    throw new Error(
      'Could not connect to the Docker daemon. Start Docker (e.g. open ' +
        'Docker Desktop) and run `vercel dev` again.'
    );
  }
}

/**
 * Build a helpful error for a `docker run` that exited before the container
 * became ready. Exit code 125 means the Docker CLI itself failed (as opposed
 * to the container process) — overwhelmingly because the daemon isn't running
 * or isn't reachable — so call that out explicitly. Any captured stderr is
 * appended so the underlying Docker message is visible.
 */
function containerExitMessage(exitCode: number, stderr: string): string {
  const detail = stderr.trim().split('\n').slice(-5).join('\n');
  const looksLikeDaemonDown =
    exitCode === 125 || /cannot connect to the docker daemon/i.test(stderr);

  if (looksLikeDaemonDown) {
    return (
      'Could not start the container: the Docker daemon is not running or ' +
      'is unreachable. Start Docker (e.g. open Docker Desktop) and try ' +
      '`vercel dev` again.' +
      (detail ? `\n\nDocker reported:\n${detail}` : '')
    );
  }

  return (
    `The container exited (code ${exitCode}) before becoming ready.` +
    (detail ? `\n\nDocker reported:\n${detail}` : '')
  );
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
}

const runningContainers = new Map<string, RunningContainer>();

// In-flight container starts, keyed the same way as `runningContainers`.
// Concurrent cold requests for the same service share this promise so we only
// ever `docker run` one container; without it each request would spawn its own
// container and all but the last would be orphaned (never `docker stop`ped).
const pendingContainers = new Map<string, Promise<StartDevServerResult>>();

/** Test-only: clear the reused-container caches between cases. */
export function __resetRunningContainers(): void {
  runningContainers.clear();
  pendingContainers.clear();
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
  const reuseKey = containerReuseKey(options);
  const existing = runningContainers.get(reuseKey);
  if (existing && existing.isRunning()) {
    return existing.result;
  }
  if (existing) {
    // Stale (exited) entry — clear it before starting a replacement.
    runningContainers.delete(reuseKey);
  }

  // Coalesce concurrent cold starts: if a start for this service is already in
  // flight, wait on it rather than spawning a second container.
  const inFlight = pendingContainers.get(reuseKey);
  if (inFlight) {
    return inFlight;
  }

  const startPromise = startContainer(options, reuseKey).finally(() => {
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

      // Fail fast with a clear message if Docker isn't running, rather than
      // letting `docker build`/`docker run` fail later with a bare exit code.
      await assertDockerAvailable(out);

      const image = await withSpan(span, 'container.dev.resolve_image', {}, s =>
        resolveDevImage(options, out, s)
      );

      const containerPort = await resolveContainerPort(image, out);
      const containerName = uniqueContainerName(
        options.service?.name ?? 'service'
      );

      // Env precedence: CLI process env, then the orchestrator's per-service
      // env (service URLs, resolved .env values), then a `PORT` the app honors.
      // Host/shell-only vars (TMPDIR, HOME, PATH, …) are filtered out: they
      // describe the developer's machine, not the Linux container, and leaking
      // them breaks apps that rely on container-native values (see
      // `isHostOnlyEnvVar`). Passed via a temp `--env-file` to keep secrets off
      // the command line and avoid arg-length limits.
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

      // Honor the host port the orchestrator pre-allocated for this service
      // (passed via `meta.port`). Service bindings are built against this port
      // (`http://127.0.0.1:${preAllocatedPort}/`), so the container must listen
      // on it for cross-service requests to reach it. Fall back to `0` (an
      // ephemeral port chosen by Docker) when no port was provided.
      const requestedHostPort = typeof meta?.port === 'number' ? meta.port : 0;

      const args = [
        'run',
        '--rm',
        '--name',
        containerName,
        // Publish the container port to the orchestrator-provided host port, or
        // an ephemeral host port chosen by Docker when none was requested.
        '-p',
        `127.0.0.1:${requestedHostPort}:${containerPort}`,
        '--env-file',
        envFilePath,
        image,
        ...(command ?? []),
      ];

      emit(out, `▲ container  vercel dev: starting container ${image}`);
      debug(`docker ${args.join(' ')}`);

      const child = spawn('docker', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      // `docker run` failures (most importantly "Cannot connect to the Docker
      // daemon", exit code 125) are reported on stderr. Retain the tail so the
      // readiness check can surface it instead of a bare exit code.
      let runStderr = '';
      child.stdout?.on('data', (data: Buffer) => onStdout?.(data));
      child.stderr?.on('data', (data: Buffer) => {
        runStderr += data.toString();
        onStderr?.(data);
      });
      // Surface the classic "command not found" case (Docker not installed)
      // with the same actionable message the build path uses.
      child.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          runStderr +=
            'Command not found: `docker`. Ensure Docker is installed and on ' +
            'your PATH, and that the Docker daemon is running.';
        }
      });

      const cleanupEnvFile = () => {
        rmSync(path.dirname(envFilePath), { recursive: true, force: true });
      };

      const shutdown = async (): Promise<void> => {
        // Drop the cache entry first so a concurrent request starts a fresh
        // container rather than reusing one that's being torn down.
        runningContainers.delete(reuseKey);
        try {
          // `docker stop` causes the foreground `docker run --rm` to exit and
          // removes the container.
          await runForwarded('docker', ['stop', containerName], out, {
            quiet: true,
          });
        } catch (err) {
          debug(
            `docker stop ${containerName} failed: ${(err as Error).message}`
          );
        } finally {
          cleanupEnvFile();
        }
      };

      // Poll for Docker's assigned host port. Any failure funnels through
      // `shutdown()` so the container is stopped and the temp env-file (which
      // holds secrets) is always removed.
      let hostPort: number | undefined;
      const deadline = Date.now() + 30_000;
      let lastErr: Error | undefined;
      try {
        while (Date.now() < deadline) {
          if (child.exitCode !== null) {
            throw new Error(containerExitMessage(child.exitCode, runStderr));
          }
          try {
            hostPort = await readMappedHostPort(
              containerName,
              containerPort,
              out
            );
            break;
          } catch (err) {
            lastErr = err as Error;
            await new Promise(resolve => setTimeout(resolve, 250));
          }
        }

        if (hostPort === undefined) {
          throw new Error(
            `Timed out waiting for container "${containerName}" to ` +
              `publish port ${containerPort}.` +
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
      });
      emit(out, `▲ container  container ready on localhost:${hostPort}`);

      const result: StartDevServerSuccess = {
        port: hostPort,
        pid: child.pid ?? 0,
        shutdown,
        // The container is a long-running server; the dev server should keep it
        // alive across requests instead of tearing it down after each response.
        persistent: true,
      };

      const running: RunningContainer = {
        result,
        containerName,
        isRunning: () => child.exitCode === null,
      };
      // If the container exits on its own (crash, `docker stop`, etc.), evict it
      // so the next request rebuilds rather than reusing a dead container.
      child.on('close', () => {
        if (runningContainers.get(reuseKey) === running) {
          runningContainers.delete(reuseKey);
        }
      });
      runningContainers.set(reuseKey, running);

      return result;
    }
  );
}
