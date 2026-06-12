import { getInternalServiceFunctionPath } from '@vercel/build-utils';
import type { BuildOptions, BuildResultV2, Span } from '@vercel/build-utils';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const version = 2;

/**
 * Host of the Vercel Container Registry. Overridable for local testing against
 * a different registry.
 */
const VCR_REGISTRY = process.env.VERCEL_VCR_REGISTRY || 'vcr.vercel.com';

/** Images must target linux/amd64 — that's the only arch Hive runs today. */
const TARGET_PLATFORM = 'linux/amd64';

const DIGEST_RE = /sha256:[a-f0-9]{64}/;

/**
 * Verbose tracing for the container builder. Enabled with `vercel build --debug`
 * (which sets `VERCEL_DEBUG`) or by exporting `VERCEL_CONTAINER_DEBUG=1`.
 */
const DEBUG =
  process.env.VERCEL_CONTAINER_DEBUG === '1' ||
  process.env.VERCEL_DEBUG === '1' ||
  process.env.BUILDER_DEBUG === '1';

function write(line: string): void {
  process.stderr.write(`${line}\n`);
}

/** Top-level milestone, prefixed with the Vercel mark. */
function info(message: string): void {
  write(`▲ container  ${message}`);
}

/** A step that's starting. */
function step(message: string): void {
  write(`  → ${message}`);
}

/** A step that finished successfully. */
function done(message: string): void {
  write(`  ✓ ${message}`);
}

function debug(message: string): void {
  if (DEBUG) {
    write(`  · ${message}`);
  }
}

function elapsed(since: number): string {
  return `${((Date.now() - since) / 1000).toFixed(1)}s`;
}

/** Shorten a `sha256:…` digest for display. */
function shortDigest(digest: string): string {
  return digest.startsWith('sha256:') ? `${digest.slice(0, 19)}…` : digest;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run `fn` inside a child span of `parent` so the container build flow is
 * traceable in the build container. When tracing is disabled (no parent span,
 * e.g. some local invocations) `fn` runs directly. The span is always stopped —
 * even when `fn` throws — so failed phases still surface in the trace, and `fn`
 * receives the span so it can attach attributes discovered while it runs.
 */
async function withSpan<T>(
  parent: Span | undefined,
  name: string,
  attrs: { [key: string]: string | undefined } | undefined,
  fn: (span?: Span) => T | Promise<T>
): Promise<T> {
  if (!parent) {
    return fn(undefined);
  }
  return parent.child(name, attrs).trace(span => fn(span));
}

/** Stringify a value for use as a span tag (tags must be strings). */
function toTag(value: unknown): string {
  return String(value);
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

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Describe a secret token for debug logs without leaking it: reports presence,
 * length, and a short non-reversible sha256 prefix so the same token can be
 * correlated across systems without exposing its value.
 */
function tokenFingerprint(token: string | undefined): string {
  if (!token) return 'absent';
  const sha = createHash('sha256').update(token).digest('hex').slice(0, 8);
  return `present(len=${token.length}, sha256=${sha})`;
}

/**
 * Log the non-secret claims of a Vercel OIDC JWT (issuer, audience, owner,
 * project, expiry, etc.) to help debug registry authorization. Only the
 * signature is sensitive; the claims themselves identify the scope of the
 * token, which is exactly what's useful when a registry rejects it.
 */
function debugTokenClaims(label: string, token: string | undefined): void {
  if (!DEBUG) return;
  if (!token) {
    debug(`${label}: <absent>`);
    return;
  }
  try {
    const payload = token.split('.')[1];
    if (!payload) {
      debug(`${label}: <not a JWT>`);
      return;
    }
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    ) as Record<string, unknown>;
    const safe = {
      iss: claims.iss,
      aud: claims.aud,
      sub: claims.sub,
      scope: claims.scope,
      owner: claims.owner,
      owner_id: claims.owner_id,
      project: claims.project,
      project_id: claims.project_id,
      exp:
        typeof claims.exp === 'number'
          ? `${new Date(claims.exp * 1000).toISOString()} (in ${Math.round(
              (claims.exp * 1000 - Date.now()) / 1000
            )}s)`
          : claims.exp,
    };
    debug(`${label}: ${JSON.stringify(safe)}`);
  } catch (err) {
    debug(`${label}: <unparseable claims> (${(err as Error).message})`);
  }
}

interface OidcClaims {
  /** Team slug, e.g. `acme`. */
  owner?: string;
  /** Team id, used as the registry login username, e.g. `team_abc123`. */
  owner_id?: string;
  /** Project slug, e.g. `my-app`. */
  project?: string;
  /** Project id, e.g. `prj_abc123`, required to create a repository. */
  project_id?: string;
}

/** Decode the (unverified) claims from a Vercel OIDC JWT. */
function decodeOidcClaims(token: string | undefined): OidcClaims {
  if (!token) return {};
  try {
    const payload = token.split('.')[1];
    if (!payload) return {};
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(json) as OidcClaims;
  } catch {
    return {};
  }
}

/**
 * Whether a container `entrypoint` points at a Dockerfile to build (rather than
 * an already-published image reference). Matches `Dockerfile`, `Containerfile`,
 * and `*.Dockerfile`.
 */
function isDockerfileRef(ref: string): boolean {
  const base = path.basename(ref).toLowerCase();
  return (
    base === 'dockerfile' ||
    base === 'containerfile' ||
    base.endsWith('.dockerfile')
  );
}

/**
 * Turn an arbitrary service name into a registry-safe repository name.
 */
function sanitizeRepository(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9-_./]/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^[-/.]+)|([-/.]+$)/g, '');
  return sanitized || 'service';
}

/**
 * Pick a deterministic-ish tag for the pushed image. The immutable digest is
 * what ultimately flows downstream, so the tag is mostly for humans.
 */
function resolveImageTag(): string {
  const sha = readString(process.env.VERCEL_GIT_COMMIT_SHA);
  if (sha) {
    return sha.slice(0, 12);
  }
  const deploymentId = readString(process.env.VERCEL_DEPLOYMENT_ID);
  if (deploymentId) {
    return deploymentId.replace(/[^a-z0-9-_.]/gi, '-');
  }
  return `build-${Date.now().toString(36)}`;
}

interface RunResult {
  stdout: string;
  stderr: string;
}

/**
 * Run a command, streaming its output to stderr (so `docker build` progress is
 * visible in build logs) while capturing it for parsing.
 */
function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; input?: string; quiet?: boolean } = {}
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      stdio: [opts.input !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      if (!opts.quiet) {
        process.stderr.write(text);
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      if (!opts.quiet) {
        process.stderr.write(text);
      }
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(
          new Error(
            `Command not found: \`${cmd}\`. Ensure \`${cmd}\` is installed and on your PATH.`
          )
        );
        return;
      }
      reject(err);
    });
    child.on('close', code => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        // Surface the tail of stderr so the failure is actionable even when the
        // child's output was captured quietly.
        const detail = stderr.trim().split('\n').slice(-5).join('\n');
        reject(
          new Error(
            `\`${cmd} ${args.join(' ')}\` exited with code ${code}` +
              (detail ? `\n${detail}` : '')
          )
        );
      }
    });

    if (opts.input !== undefined) {
      child.stdin?.end(opts.input);
    }
  });
}

/**
 * Block until the pushed image is usable. The authoritative readiness signal is
 * api-vcr reporting `image.vhs`/`ready` once OCI->VHS conversion completes
 * (~30-60s after push). When that endpoint is available, point
 * `VERCEL_VCR_READY_URL` at it (it's polled with the OIDC token as a bearer and
 * treated ready when the response has `ready: true` or a truthy `vhs`).
 *
 * Without a configured endpoint we fall back to confirming the pushed digest
 * resolves in the registry. This is a temporary gate — readiness will likely
 * move into api-builds once the flow is wired end to end.
 */
async function waitForImageReady(imageRef: string, span?: Span): Promise<void> {
  if (process.env.VERCEL_VCR_SKIP_READY_CHECK === '1') {
    span?.setAttributes({ 'readiness.mode': 'skipped' });
    return;
  }

  const timeoutMs = Number(process.env.VERCEL_VCR_READY_TIMEOUT_MS) || 300_000;
  const intervalMs = Number(process.env.VERCEL_VCR_READY_INTERVAL_MS) || 3_000;
  const readyUrl = readString(process.env.VERCEL_VCR_READY_URL);
  const token = readString(process.env.VERCEL_OIDC_TOKEN);
  const deadline = Date.now() + timeoutMs;

  span?.setAttributes({
    'readiness.mode': readyUrl ? 'ready_url' : 'manifest_inspect',
    'readiness.timeout_ms': toTag(timeoutMs),
  });

  debug(
    readyUrl
      ? `readiness: polling ${readyUrl} every ${intervalMs}ms (timeout ${Math.round(timeoutMs / 1000)}s)`
      : `readiness: VERCEL_VCR_READY_URL unset — confirming digest resolves via \`docker manifest inspect\` (timeout ${Math.round(timeoutMs / 1000)}s)`
  );

  let attempt = 0;
  for (;;) {
    attempt++;
    try {
      if (readyUrl) {
        const res = await fetch(readyUrl, {
          headers: token ? { authorization: `Bearer ${token}` } : {},
        });
        debug(`readiness attempt ${attempt}: HTTP ${res.status}`);
        if (res.ok) {
          const body = (await res.json()) as {
            ready?: boolean;
            vhs?: unknown;
          };
          if (body.ready === true || Boolean(body.vhs)) {
            span?.setAttributes({ 'readiness.attempts': toTag(attempt) });
            return;
          }
        }
      } else {
        await run('docker', ['manifest', 'inspect', imageRef], { quiet: true });
        debug(`readiness attempt ${attempt}: manifest resolved`);
        span?.setAttributes({ 'readiness.attempts': toTag(attempt) });
        return;
      }
    } catch (err) {
      // Not ready yet — keep polling until the deadline.
      debug(
        `readiness attempt ${attempt}: not ready (${(err as Error).message})`
      );
    }

    if (Date.now() >= deadline) {
      span?.setAttributes({
        'readiness.attempts': toTag(attempt),
        'readiness.timed_out': 'true',
      });
      throw new Error(
        `Timed out after ${Math.round(
          timeoutMs / 1000
        )}s waiting for "${imageRef}" to become ready in the Vercel Container Registry.`
      );
    }
    await delay(intervalMs);
  }
}

/**
 * Verify the Docker CLI is installed and the daemon is reachable before we try
 * to build, so failures point at the real problem (missing CLI / stopped
 * daemon) instead of a generic non-zero exit code.
 */
async function ensureDockerReady(span?: Span): Promise<void> {
  try {
    const { stdout } = await run(
      'docker',
      ['version', '--format', '{{.Server.Version}}'],
      { quiet: true }
    );
    span?.setAttributes({ 'docker.server_version': stdout.trim() });
  } catch (err) {
    const message = (err as Error).message;
    const onVercel = isBuildContainer();

    if (/Command not found/i.test(message)) {
      throw new Error(
        onVercel
          ? 'The `docker` CLI is not available in this build container. The ' +
              'container runtime requires Docker to be installed in the build image.'
          : 'Docker CLI was not found on your PATH. Install Docker and make sure ' +
              'the `docker` command is available so the container image can be built.'
      );
    }

    throw new Error(
      (onVercel
        ? [
            'The Docker daemon is not available in this build container.',
            '',
            'Container builds start and manage their own dockerd; not being able',
            'to reach it points at a missing Docker install or insufficient kernel',
            'capabilities in the build image rather than anything in your project.',
          ]
        : [
            'Cannot connect to the Docker daemon — is Docker running?',
            '',
            'Start Docker (Docker Desktop, Colima, or OrbStack) and verify it with',
            '`docker info`, then re-run the build. If you use a non-default socket,',
            'set DOCKER_HOST or select the right context with `docker context use`.',
          ]
      )
        .concat(['', `Underlying error: ${message}`])
        .join('\n')
    );
  }
}

/** Pull a `Key: Value` field out of `docker info` / `docker version` text. */
function extractField(text: string, label: string): string | undefined {
  const match = text.match(new RegExp(`^\\s*${label}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim();
}

/**
 * Log the Docker toolchain in use so build-cell failures can be correlated with
 * a specific client/daemon. The container registry push is sensitive to which
 * pusher runs (classic `dockerd` vs BuildKit/containerd), the storage driver,
 * and the image store, so we surface all of them. Best-effort: never fail the
 * build just because diagnostics couldn't be gathered.
 */
async function logDockerDiagnostics(span?: Span): Promise<void> {
  try {
    const [version, dockerInfo] = await Promise.all([
      run('docker', ['version'], { quiet: true })
        .then(r => r.stdout)
        .catch(() => ''),
      run('docker', ['info'], { quiet: true })
        .then(r => r.stdout)
        .catch(() => ''),
    ]);

    // `docker version` prints two `Version:` lines (Client then Server); the
    // section headers let us attribute them correctly.
    const clientVersion = extractField(
      version.split(/^Server:/m)[0] ?? version,
      'Version'
    );
    const serverBlock = version.split(/^Server:/m)[1] ?? '';
    const serverVersion =
      extractField(serverBlock, 'Version') ??
      extractField(dockerInfo, 'Server Version');
    const apiVersion = extractField(
      version.split(/^Server:/m)[0] ?? version,
      'API version'
    );
    const osArch = extractField(serverBlock, 'OS/Arch');

    const storageDriver = extractField(dockerInfo, 'Storage Driver');
    // containerd image store (the containerd snapshotter) changes the push code
    // path from the classic distribution pusher to containerd's pusher.
    const usingContainerdStore = /driver-type io\.containerd\./i.test(
      dockerInfo
    );

    let buildxDriver: string | undefined;
    let buildxVersion: string | undefined;
    try {
      buildxVersion = (
        await run('docker', ['buildx', 'version'], { quiet: true })
      ).stdout.trim();
      const inspect = (
        await run('docker', ['buildx', 'inspect'], { quiet: true })
      ).stdout;
      buildxDriver = extractField(inspect, 'Driver');
    } catch {
      // buildx not installed / no active builder — fine.
    }

    // Egress proxy is the leading suspect for the build-cell-only push failures:
    // a TLS-terminating forward proxy can rewrite/drop the layer-upload
    // `Content-Type`, which the registry then rejects. Surface any proxy config
    // (process env + what dockerd itself was started with) so a real build log
    // shows whether the push traffic is going through one.
    const proxyEnv = [
      'HTTP_PROXY',
      'http_proxy',
      'HTTPS_PROXY',
      'https_proxy',
      'NO_PROXY',
      'no_proxy',
      'ALL_PROXY',
      'all_proxy',
    ]
      .map(name => {
        const value = readString(process.env[name]);
        return value ? `${name}=${value}` : undefined;
      })
      .filter((entry): entry is string => Boolean(entry));
    const dockerHttpProxy = extractField(dockerInfo, 'HTTP Proxy');
    const dockerHttpsProxy = extractField(dockerInfo, 'HTTPS Proxy');
    const dockerNoProxy = extractField(dockerInfo, 'No Proxy');

    info(
      `docker: client=${clientVersion ?? '?'} server=${serverVersion ?? '?'} ` +
        `storage-driver=${storageDriver ?? '?'} ` +
        `containerd-store=${usingContainerdStore} ` +
        `buildx-driver=${buildxDriver ?? 'n/a'}`
    );
    info(
      `egress proxy: env=[${proxyEnv.join(', ') || 'none'}] ` +
        `daemon=[http=${dockerHttpProxy ?? 'none'}, ` +
        `https=${dockerHttpsProxy ?? 'none'}, no=${dockerNoProxy ?? 'none'}]`
    );
    debug(`docker API version: ${apiVersion ?? '?'} (server ${osArch ?? '?'})`);
    debug(`docker buildx: ${buildxVersion ?? 'n/a'}`);
    if (version) {
      debug(`--- docker version ---\n${version.trim()}`);
    }
    if (dockerInfo) {
      debug(`--- docker info ---\n${dockerInfo.trim()}`);
    }

    span?.setAttributes({
      'docker.client_version': toTag(clientVersion),
      'docker.server_version': toTag(serverVersion),
      'docker.api_version': toTag(apiVersion),
      'docker.os_arch': toTag(osArch),
      'docker.storage_driver': toTag(storageDriver),
      'docker.containerd_store': toTag(usingContainerdStore),
      'docker.buildx_driver': toTag(buildxDriver),
      'docker.buildx_version': toTag(buildxVersion),
      'docker.proxy_env': toTag(proxyEnv.join(',') || 'none'),
      'docker.daemon_http_proxy': toTag(dockerHttpProxy),
      'docker.daemon_https_proxy': toTag(dockerHttpsProxy),
    });
  } catch (err) {
    debug(`docker diagnostics unavailable: ${(err as Error).message}`);
  }
}

/** Whether the Docker daemon currently answers `docker version`. */
async function isDockerDaemonReachable(): Promise<boolean> {
  try {
    await run('docker', ['version', '--format', '{{.Server.Version}}'], {
      quiet: true,
    });
    return true;
  } catch {
    return false;
  }
}

/** Whether `name` resolves on the PATH (used to detect dockerd/fuse-overlayfs). */
async function hasBinary(name: string): Promise<boolean> {
  try {
    await run('which', [name], { quiet: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether we're running inside a Vercel build container (an ephemeral Hive
 * cell) rather than a local `vercel build`. `VERCEL_BUILD_IMAGE` is set only on
 * Vercel's build image — `VERCEL`/`NOW_BUILDER` are set for local builds too, so
 * they can't be used here. This drives environment-appropriate error messages
 * and daemon teardown behavior.
 */
function isBuildContainer(): boolean {
  return Boolean(readString(process.env.VERCEL_BUILD_IMAGE));
}

/**
 * Choose the dockerd storage driver. `VERCEL_VCR_DOCKER_STORAGE_DRIVER`
 * overrides everything. Otherwise prefer `fuse-overlayfs` when it's actually
 * usable (binary on PATH + `/dev/fuse` present) and fall back to `vfs`, which
 * works on any filesystem — including the overlay rootfs of a build cell, where
 * docker's default `overlay2` cannot stack. `vfs` is slower and copies layers,
 * but it's the dependency-free baseline; fuse-overlayfs is the optimization.
 */
async function selectStorageDriver(): Promise<string> {
  const override = readString(process.env.VERCEL_VCR_DOCKER_STORAGE_DRIVER);
  if (override) {
    return override;
  }
  if ((await hasBinary('fuse-overlayfs')) && existsSync('/dev/fuse')) {
    return 'fuse-overlayfs';
  }
  return 'vfs';
}

interface ManagedDaemon {
  child: ChildProcess;
  logTail: () => string;
}

/** Last `n` lines of captured daemon output, for surfacing in errors. */
function tail(text: string, n = 12): string {
  return text.trim().split('\n').slice(-n).join('\n');
}

/**
 * Start a `dockerd` we own (build cells have no daemon running). Polls until the
 * socket answers, then returns a handle so we can stop it afterwards. Throws
 * with the tail of the daemon log if it exits early or never becomes ready.
 */
async function startDockerDaemon(span?: Span): Promise<ManagedDaemon> {
  const driver = await selectStorageDriver();
  // Keep iptables enabled so RUN steps that need the network work. The build
  // container image is responsible for making iptables usable (install iptables
  // and select the legacy backend: `alternatives --set iptables
  // /usr/sbin/iptables-legacy`), since the default nf_tables backend can't
  // manage netfilter rules in a restricted cell. As an escape hatch for cells
  // where iptables can't work at all (and images that don't need RUN-time
  // networking), pass `--iptables=false` via VERCEL_VCR_DOCKERD_ARGS.
  const args = ['--storage-driver', driver];
  const extra = readString(process.env.VERCEL_VCR_DOCKERD_ARGS);
  if (extra) {
    args.push(...extra.split(' ').filter(Boolean));
  }

  span?.setAttributes({ 'docker.storage_driver': driver });
  step(`Starting Docker daemon (storage-driver=${driver})`);
  debug(`exec: dockerd ${args.join(' ')}`);

  const child = spawn('dockerd', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let log = '';
  const capture = (chunk: Buffer) => {
    const text = chunk.toString();
    log += text;
    if (DEBUG) {
      process.stderr.write(text);
    }
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);

  let exitInfo: string | undefined;
  child.on('exit', (code, signal) => {
    exitInfo = `code=${code ?? 'null'} signal=${signal ?? 'null'}`;
  });

  const timeoutMs = Number(process.env.VERCEL_VCR_DOCKERD_TIMEOUT_MS) || 30_000;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (exitInfo !== undefined) {
      throw new Error(
        [
          `The Docker daemon exited before becoming ready (${exitInfo}).`,
          'In a build container this usually means the cell is missing the',
          `kernel capabilities dockerd needs, or the "${driver}" storage driver`,
          'is unavailable. Override the storage driver with',
          'VERCEL_VCR_DOCKER_STORAGE_DRIVER, or pass extra daemon flags with',
          'VERCEL_VCR_DOCKERD_ARGS (e.g. "--iptables=false") for networking issues.',
          '',
          tail(log),
        ].join('\n')
      );
    }
    if (await isDockerDaemonReachable()) {
      done('Docker daemon ready');
      return { child, logTail: () => log };
    }
    if (Date.now() >= deadline) {
      child.kill('SIGKILL');
      throw new Error(
        [
          `The Docker daemon did not become ready within ${Math.round(
            timeoutMs / 1000
          )}s.`,
          'In a build container this usually means the cell is missing the',
          `kernel capabilities dockerd needs, or the "${driver}" storage driver`,
          'is unavailable. Override it with VERCEL_VCR_DOCKER_STORAGE_DRIVER.',
          '',
          tail(log),
        ].join('\n')
      );
    }
    await delay(500);
  }
}

/** Stop a daemon we started: SIGTERM, then SIGKILL if it doesn't exit. */
async function stopDockerDaemon(
  daemon: ManagedDaemon,
  span?: Span
): Promise<void> {
  const { child } = daemon;
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  step('Stopping Docker daemon');
  const stopTimeoutMs =
    Number(process.env.VERCEL_VCR_DOCKERD_STOP_TIMEOUT_MS) || 10_000;
  await new Promise<void>(resolve => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    child.once('exit', finish);
    child.kill('SIGTERM');
    setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // already gone
      }
      finish();
    }, stopTimeoutMs).unref?.();
  });
  span?.setAttributes({ 'docker.daemon_stopped': 'true' });
  done('Docker daemon stopped');
}

/**
 * Detach from a daemon we started without stopping it. Used in the build
 * container, which is ephemeral and torn down wholesale after the build — so
 * there's no value in a graceful shutdown. We still drop our listeners and
 * `unref` the child + its pipes so the leftover dockerd can't keep our process
 * alive (a piped, ref'd child would otherwise block exit).
 */
function detachDaemon(daemon: ManagedDaemon): void {
  const { child } = daemon;
  child.stdout?.removeAllListeners('data');
  child.stderr?.removeAllListeners('data');
  // Closing the pipes releases their hold on the event loop; unref'ing the
  // child lets our process exit while the (soon-to-be-destroyed) cell keeps
  // dockerd running.
  child.stdout?.destroy();
  child.stderr?.destroy();
  child.unref();
}

/**
 * Run `fn` with a Docker daemon available. If one is already reachable (e.g. a
 * developer's local Docker Desktop/OrbStack), use it untouched. Otherwise, when
 * a `dockerd` binary is present (build cell), start one we own and stop it in a
 * `finally` so it's always torn down. When neither is true, run `fn` anyway and
 * let `ensureDockerReady` surface the actionable "install/start Docker" error.
 */
async function withManagedDaemon<T>(
  span: Span | undefined,
  fn: () => Promise<T>
): Promise<T> {
  if (await isDockerDaemonReachable()) {
    return fn();
  }
  if (!(await hasBinary('dockerd'))) {
    return fn();
  }
  const daemon = await withSpan(span, 'container.start_daemon', undefined, s =>
    startDockerDaemon(s)
  );
  try {
    return await fn();
  } finally {
    // Only ever touch a daemon we started ourselves. In the build container the
    // cell is ephemeral, so we just detach (no graceful shutdown). Locally we
    // stop it so a `vercel build` never leaves a stray dockerd behind.
    if (isBuildContainer()) {
      detachDaemon(daemon);
    } else {
      await withSpan(span, 'container.stop_daemon', undefined, s =>
        stopDockerDaemon(daemon, s)
      );
    }
  }
}

/**
 * Ensure the target VCR repository exists before pushing. Repositories must be
 * created out-of-band today (a push to a missing repo is denied with 404), so
 * the build creates it idempotently via the Vercel API. A 409 means it already
 * exists. This is best-effort: on failure we log and continue, letting the push
 * surface a clear, actionable error.
 */
async function ensureRepository(
  repository: string,
  token: string,
  claims: OidcClaims,
  span?: Span
): Promise<void> {
  // Only auto-create bare repo names. A slash means the caller fully qualified
  // the path and we can't reliably infer the owning project.
  if (repository.includes('/')) {
    debug(`skipping repository auto-create (fully-qualified "${repository}")`);
    span?.setAttributes({ 'repository.create_result': 'skipped_qualified' });
    return;
  }

  const teamId = claims.owner_id;
  const projectId = claims.project_id;
  if (!teamId || !projectId) {
    debug(
      `skipping repository auto-create (missing ${
        !teamId ? 'team id' : 'project id'
      })`
    );
    span?.setAttributes({
      'repository.create_result': 'skipped_missing_ids',
    });
    return;
  }

  span?.setAttributes({ 'team.id': teamId, 'project.id': projectId });

  const apiUrl = (
    readString(process.env.VERCEL_API_URL) ?? 'https://api.vercel.com'
  ).replace(/\/+$/, '');
  const url = `${apiUrl}/v1/vcr/repository?teamId=${encodeURIComponent(teamId)}`;
  const body = JSON.stringify({ name: repository, projectId });

  step(`Ensuring registry repository "${repository}"`);
  debug(`repository create: POST ${url}`);
  debug(`repository create body: ${body}`);
  debug(
    `repository create auth: Bearer ${tokenFingerprint(token)} (teamId=${teamId}, projectId=${projectId})`
  );
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body,
    });
    span?.setAttributes({ 'repository.create_status': toTag(res.status) });
    if (res.ok) {
      debug(`repository create returned ${res.status}`);
      span?.setAttributes({ 'repository.create_result': 'created' });
      done(`created repository "${repository}"`);
    } else if (res.status === 409) {
      debug(`repository create returned 409 (already exists)`);
      span?.setAttributes({ 'repository.create_result': 'already_exists' });
      done(`repository "${repository}" already exists`);
    } else {
      const text = await res.text().catch(() => '');
      debug(
        `repository auto-create returned ${res.status}: ${text.slice(0, 500)}`
      );
      span?.setAttributes({ 'repository.create_result': 'unexpected_status' });
      done('continuing — push will validate the repository');
    }
  } catch (err) {
    debug(`repository auto-create failed: ${(err as Error).message}`);
    span?.setAttributes({ 'repository.create_result': 'error' });
    done('continuing — push will validate the repository');
  }
}

async function buildAndPushImage(params: {
  contextDir: string;
  dockerfilePath: string;
  repository: string;
  tag: string;
  parentSpan?: Span;
}): Promise<string> {
  const { contextDir, dockerfilePath, repository, tag, parentSpan } = params;

  // VCR auth is OIDC-only: the project's OIDC token (auto-pulled by
  // `vercel build`) is the docker-login password, the team id from its claims is
  // the username, and the repository is namespaced `<team_slug>/<project_slug>/<repo>`
  // using the slugs from those same claims.
  const token = readString(process.env.VERCEL_OIDC_TOKEN);
  if (!token) {
    throw new Error(
      'Missing VERCEL_OIDC_TOKEN for the container registry ' +
        '(it is auto-pulled by `vercel build`).'
    );
  }
  const claims = decodeOidcClaims(token);
  debug(`registry token: ${tokenFingerprint(token)}`);
  debugTokenClaims('OIDC token claims', token);

  const username = claims.owner_id;
  if (!username) {
    throw new Error(
      'The OIDC token is missing the `owner_id` (team id) claim required to ' +
        'authenticate to the container registry.'
    );
  }

  const fullRepository = [claims.owner, claims.project, repository].join('/');
  const imageRef = `${VCR_REGISTRY}/${fullRepository}:${tag}`;

  return withSpan(
    parentSpan,
    'container.build_and_push',
    {
      'container.registry': VCR_REGISTRY,
      'container.repository': fullRepository,
      'image.tag': tag,
      'image.ref': imageRef,
      'registry.username': username,
    },
    async buildSpan => {
      await withSpan(
        buildSpan,
        'container.ensure_repository',
        { 'container.repository': repository },
        s => ensureRepository(repository, token, claims, s)
      );

      // Build/login/push/readiness all need a Docker daemon. In a build cell
      // there's none running, so start one we own (and tear it down after);
      // locally we reuse the developer's existing daemon untouched.
      return withManagedDaemon(buildSpan, async () => {
        await withSpan(
          buildSpan,
          'container.ensure_docker_ready',
          undefined,
          s => ensureDockerReady(s)
        );

        await withSpan(
          buildSpan,
          'container.docker_diagnostics',
          undefined,
          s => logDockerDiagnostics(s)
        );

        info(`Building image ${imageRef}`);
        debug(`dockerfile: ${dockerfilePath}`);
        debug(`context:    ${contextDir}`);
        debug(`platform:   ${TARGET_PLATFORM}`);
        debug(`registry:   ${VCR_REGISTRY}`);
        debug(`username:   ${username}`);
        debug(`repository: ${fullRepository}`);

        const buildStart = Date.now();
        step(`docker build (${TARGET_PLATFORM})`);
        await withSpan(
          buildSpan,
          'container.docker_build',
          { 'image.ref': imageRef, 'image.platform': TARGET_PLATFORM },
          () =>
            run('docker', [
              'build',
              '--platform',
              TARGET_PLATFORM,
              '-t',
              imageRef,
              '-f',
              dockerfilePath,
              contextDir,
            ])
        );
        done(`built in ${elapsed(buildStart)}`);

        // Authenticate to VCR: the OIDC token is the password (passed via stdin,
        // never argv) and the team id is the username.
        step(`Authenticating to ${VCR_REGISTRY} as ${username}`);
        debug(
          `exec: docker login ${VCR_REGISTRY} --username ${username} --password-stdin ` +
            `(OIDC token on stdin, ${tokenFingerprint(token)})`
        );
        await withSpan(
          buildSpan,
          'container.registry_login',
          {
            'container.registry': VCR_REGISTRY,
            'registry.username': username,
          },
          async () => {
            try {
              await run(
                'docker',
                [
                  'login',
                  VCR_REGISTRY,
                  '--username',
                  username,
                  '--password-stdin',
                ],
                { input: token, quiet: !DEBUG }
              );
            } catch (err) {
              const message = (err as Error).message;
              if (/denied|forbidden|unauthorized|401|403/i.test(message)) {
                throw new Error(
                  [
                    `Authentication to ${VCR_REGISTRY} as "${username}" was rejected.`,
                    '',
                    `Make sure your team ("${username}") is enrolled in the`,
                    '`vercel-enable-vcr` flag and that the OIDC token is valid for it.',
                    '',
                    `Underlying error: ${message}`,
                  ].join('\n')
                );
              }
              throw err;
            }
          }
        );
        done('authenticated');

        const pushStart = Date.now();
        step(`Pushing ${imageRef}`);
        const digest = await withSpan(
          buildSpan,
          'container.push',
          { 'image.ref': imageRef },
          async pushSpan => {
            let stdout: string;
            try {
              ({ stdout } = await run('docker', ['push', imageRef]));
            } catch (err) {
              const message = (err as Error).message;
              if (
                /denied|forbidden|unauthorized|not found|401|403|404/i.test(
                  message
                )
              ) {
                throw new Error(
                  [
                    `Pushing ${imageRef} was denied.`,
                    '',
                    `The build tried to ensure the "${repository}" repository exists, but`,
                    'the push was still rejected. This usually means the token lacks access',
                    'to the project, or your team is not enrolled in the `vercel-enable-vcr`',
                    "flag. Verify access (or create the repository under your project's",
                    'Sandboxes → Container Registry tab), then re-run the build.',
                    '',
                    `Underlying error: ${message}`,
                  ].join('\n')
                );
              }
              throw err;
            }

            // Prefer the immutable digest so api-builds resolves a stable image.
            let resolvedDigest = stdout.match(DIGEST_RE)?.[0];
            if (!resolvedDigest) {
              debug('digest not found in push output — inspecting RepoDigests');
              const inspect = await run(
                'docker',
                ['inspect', '--format', '{{index .RepoDigests 0}}', imageRef],
                { quiet: true }
              );
              resolvedDigest = inspect.stdout.match(DIGEST_RE)?.[0];
            }
            pushSpan?.setAttributes({ 'image.digest': resolvedDigest });
            return resolvedDigest;
          }
        );
        done(
          digest
            ? `pushed ${shortDigest(digest)} in ${elapsed(pushStart)}`
            : `pushed in ${elapsed(pushStart)}`
        );

        const resolvedRef = digest
          ? `${VCR_REGISTRY}/${fullRepository}@${digest}`
          : imageRef;
        buildSpan?.setAttributes({
          'image.digest': digest,
          'image.resolved_ref': resolvedRef,
        });

        // Block until the OCI->VHS conversion has completed so downstream routing
        // can boot the image immediately.
        const readyStart = Date.now();
        step('Waiting for image to be ready (OCI → VHS conversion)');
        await withSpan(
          buildSpan,
          'container.wait_for_ready',
          { 'image.ref': resolvedRef },
          s => waitForImageReady(resolvedRef, s)
        );
        done(`ready in ${elapsed(readyStart)}`);

        info(`Image reference ${resolvedRef}`);
        return resolvedRef;
      });
    }
  );
}

/**
 * Resolve the container image reference for this service. Either:
 *  - build a Dockerfile and push it to VCR, returning the pushed digest, or
 *  - pass through a prebuilt image reference from the service config/entrypoint.
 */
async function resolveImageHandler(
  options: BuildOptions,
  span?: Span
): Promise<string> {
  const { config, workPath, entrypoint, meta } = options;

  const entrypointRef = readString(entrypoint);
  // A container service builds from a Dockerfile when one is configured, when
  // the entrypoint points at a Dockerfile, or when a `Dockerfile` exists in the
  // work dir. Otherwise the entrypoint is a prebuilt image reference.
  const dockerfileConfigured =
    readString(config.dockerfile) ??
    (entrypointRef && isDockerfileRef(entrypointRef)
      ? entrypointRef
      : undefined);
  const dockerfileRel = dockerfileConfigured ?? 'Dockerfile';
  const dockerfilePath = path.join(workPath, dockerfileRel);
  const hasDockerfile =
    dockerfileConfigured !== undefined || existsSync(dockerfilePath);

  const prebuiltImage =
    readString(config.handler) ??
    readString(config.image) ??
    (hasDockerfile ? undefined : entrypointRef);

  debug(`workPath:    ${workPath}`);
  debug(
    `dockerfile:  ${dockerfileRel} (exists: ${existsSync(dockerfilePath)})`
  );
  debug(`prebuilt:    ${prebuiltImage ?? '<none>'}`);
  debug(`isDev:       ${Boolean(meta?.isDev)}`);

  span?.setAttributes({
    'container.has_dockerfile': toTag(hasDockerfile),
    'container.is_dev': toTag(Boolean(meta?.isDev)),
  });

  if (!hasDockerfile) {
    if (!prebuiltImage) {
      throw new Error(
        'Container service must specify a prebuilt image (via "image"/entrypoint) or a "dockerfile" to build.'
      );
    }
    span?.setAttributes({ 'container.mode': 'prebuilt' });
    info(`Using prebuilt image ${prebuiltImage}`);
    return prebuiltImage;
  }

  // `vercel dev` can't build & push images; fall back to a prebuilt reference.
  if (meta?.isDev) {
    if (prebuiltImage) {
      span?.setAttributes({ 'container.mode': 'prebuilt_dev' });
      info(`vercel dev: using prebuilt image ${prebuiltImage}`);
      return prebuiltImage;
    }
    throw new Error(
      '`vercel dev` cannot build container images from a Dockerfile. Specify a prebuilt "image" for local development.'
    );
  }

  if (!existsSync(dockerfilePath)) {
    throw new Error(
      `Dockerfile not found at "${dockerfilePath}" for container service.`
    );
  }

  // The repository is named after the service; it gets namespaced under the
  // team/project (from the OIDC claims) at push time.
  const serviceName = options.service?.name;
  if (!serviceName) {
    throw new Error(
      'Container service is missing a name; cannot derive the registry repository.'
    );
  }
  const repository = sanitizeRepository(serviceName);
  const tag = resolveImageTag();
  // The build context is the Dockerfile's directory (Docker convention), which
  // keeps the context small without special-casing service roots.
  const contextDir = path.dirname(dockerfilePath);

  span?.setAttributes({
    'container.mode': 'build_and_push',
    'container.repository': repository,
    'image.tag': tag,
  });
  return buildAndPushImage({
    contextDir,
    dockerfilePath,
    repository,
    tag,
    parentSpan: span,
  });
}

export async function build(options: BuildOptions): Promise<BuildResultV2> {
  // Root the container build flow under the builder span the CLI provides, so
  // every phase (repo create, docker build, login, push, readiness) is
  // traceable in the build container.
  const handler = await withSpan(
    options.span,
    'container.resolve_image',
    { 'service.name': options.service?.name },
    span => resolveImageHandler(options, span)
  );

  const command = normalizeCommand(options.config.command);

  const outputPath = options.service?.name
    ? getInternalServiceFunctionPath(options.service.name).replace(/^\//, '')
    : 'index';

  return {
    output: {
      [outputPath]: {
        // Emit a Lambda-typed output with `runtime: 'container'`. The build
        // container keys off `type === 'Lambda' && runtime === 'container'`
        // (vercel/api#74661) to collect container image functions, so the
        // output must use the `Lambda` discriminator rather than a bespoke type.
        type: 'Lambda',
        files: {},
        handler,
        runtime: 'container',
        environment: {},
        ...(command ? { command } : {}),
      } as any,
    },
  };
}
