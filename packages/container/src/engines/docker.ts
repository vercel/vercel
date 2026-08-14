import type { Span } from '@vercel/build-utils';
import { spawn, type ChildProcess } from 'node:child_process';
import { formatVcrAuthError } from '../oidc';
import {
  DEBUG,
  debug,
  done,
  extractField,
  info,
  isBuildContainer,
  readString,
  run,
  step,
  toTag,
  withSpan,
} from '../util';
import { selectStorageDriver } from '../storage-driver';
import type { BuildPushParams, ContainerEngine } from './types';
import { TARGET_PLATFORM, buildArgFlags } from './types';

/** Run `docker` with the given args, logging the exact invocation for debugging. */
function runDocker(
  args: string[],
  opts: { input?: string; quiet?: boolean } = {}
) {
  // `--password-stdin` reads the secret from stdin, so nothing sensitive is on
  // the command line.
  debug(`exec: docker ${args.join(' ')}`);
  return run('docker', args, opts);
}

async function hasBinary(name: string): Promise<boolean> {
  try {
    await run('which', [name], { quiet: true });
    return true;
  } catch {
    return false;
  }
}

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

interface ManagedDaemon {
  child: ChildProcess;
  logTail: () => string;
}

function tail(text: string, n = 12): string {
  return text.trim().split('\n').slice(-n).join('\n');
}

async function startDockerDaemon(span?: Span): Promise<ManagedDaemon> {
  // Docker is the local-dev engine; selectStorageDriver only returns undefined
  // in the build container (buildah), so default to vfs defensively.
  const driver = (await selectStorageDriver()) ?? 'vfs';
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
          'In a build container this usually means the environment is missing the',
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
          'In a build container this usually means the environment is missing the',
          `kernel capabilities dockerd needs, or the "${driver}" storage driver`,
          'is unavailable. Override it with VERCEL_VCR_DOCKER_STORAGE_DRIVER.',
          '',
          tail(log),
        ].join('\n')
      );
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

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

function detachDaemon(daemon: ManagedDaemon): void {
  const { child } = daemon;
  child.stdout?.removeAllListeners('data');
  child.stderr?.removeAllListeners('data');
  child.stdout?.destroy();
  child.stderr?.destroy();
  child.unref();
}

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
    if (isBuildContainer()) {
      detachDaemon(daemon);
    } else {
      await withSpan(span, 'container.stop_daemon', undefined, s =>
        stopDockerDaemon(daemon, s)
      );
    }
  }
}

export const dockerEngine: ContainerEngine = {
  name: 'docker',

  async ensureReady(span?: Span): Promise<void> {
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
            ? 'The `docker` CLI is not available in this build container.'
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
              '`docker info`, then re-run the build.',
            ]
        )
          .concat(['', `Underlying error: ${message}`])
          .join('\n')
      );
    }
  },

  async logDiagnostics(span?: Span): Promise<void> {
    try {
      const [version, dockerInfo] = await Promise.all([
        run('docker', ['version'], { quiet: true })
          .then(r => r.stdout)
          .catch(() => ''),
        run('docker', ['info'], { quiet: true })
          .then(r => r.stdout)
          .catch(() => ''),
      ]);

      const clientVersion = extractField(
        version.split(/^Server:/m)[0] ?? version,
        'Version'
      );
      const serverBlock = version.split(/^Server:/m)[1] ?? '';
      const serverVersion =
        extractField(serverBlock, 'Version') ??
        extractField(dockerInfo, 'Server Version');
      const storageDriver = extractField(dockerInfo, 'Storage Driver');

      info(
        `docker: client=${clientVersion ?? '?'} server=${serverVersion ?? '?'} ` +
          `storage-driver=${storageDriver ?? '?'}`
      );
      debug(`--- docker version ---\n${version.trim()}`);

      span?.setAttributes({
        'container.engine': 'docker',
        'docker.client_version': toTag(clientVersion),
        'docker.server_version': toTag(serverVersion),
        'docker.storage_driver': toTag(storageDriver),
      });
    } catch (err) {
      debug(`docker diagnostics unavailable: ${(err as Error).message}`);
    }
  },

  withRuntime: withManagedDaemon,

  async build(params: BuildPushParams): Promise<void> {
    await runDocker([
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
      await runDocker(
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
      info(`pushing ${params.imageRef}`);
      const pushStart = Date.now();
      const { stdout } = await runDocker(['push', params.imageRef]);
      debug(`push completed in ${Date.now() - pushStart}ms`);
      let resolvedDigest = stdout.match(/sha256:[a-f0-9]{64}/)?.[0];
      if (!resolvedDigest) {
        debug('digest not found in push output — inspecting RepoDigests');
        const inspect = await run(
          'docker',
          ['inspect', '--format', '{{index .RepoDigests 0}}', params.imageRef],
          { quiet: true }
        );
        resolvedDigest = inspect.stdout.match(/sha256:[a-f0-9]{64}/)?.[0];
      }
      return resolvedDigest;
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
};
