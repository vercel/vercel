import type { Span } from '@vercel/build-utils';
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { stringify as stringifyToml } from 'smol-toml';
import { DIGEST_RE, TARGET_PLATFORM } from '../engines/types';
import { buildahStorageArgs } from '../storage-driver';
import type { DevOutput, RunError, RunResult } from '../util';
import {
  assertValidCommandShell,
  debug,
  done,
  run,
  step,
  withSpan,
  write,
} from '../util';
import type { BuildpackDescriptor } from './registry';
import { devBuilderImageRef, devRunImageRef } from './registry';

export interface LifecycleBuildParams {
  workPath: string;
  tag: string;
  buildEnv?: Record<string, string>;
  builder?: string;
}

export interface LifecycleRegistryBuildParams
  extends Omit<LifecycleBuildParams, 'tag'> {
  imageRef: string;
  registry: string;
  username: string;
  token: string;
  /**
   * `command` override from vercel.json. Baked into the image as its default
   * `web` process (see `writeCommandProcfile`) rather than applied at run
   * time: production launches container services from the image's own OCI
   * config (entrypoint + cmd), not from build-output metadata.
   */
  command?: string[];
  /** Whether `command` originated as a shell command string. */
  commandShell?: boolean;
}

export interface LifecycleRegistryBuildResult {
  imageRef: string;
  digest: string;
  builder: string;
}

function emit(out: DevOutput, line: string): void {
  if (out.onStderr) {
    out.onStderr(Buffer.from(`${line}\n`));
  } else {
    process.stderr.write(`${line}\n`);
  }
}

interface PreparedAppDirectory {
  workPath: string;
  cleanup?: () => void;
}

function makeRuntimeReadable(path: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    chmodSync(path, stat.mode | 0o055);
    for (const entry of readdirSync(path)) {
      makeRuntimeReadable(join(path, entry));
    }
    return;
  }
  if (stat.isFile()) {
    const runtimeExecute = (stat.mode & 0o111) !== 0 ? 0o011 : 0;
    chmodSync(path, stat.mode | 0o044 | runtimeExecute);
  }
}

function needsRuntimeReadableCopy(path: string): boolean {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return false;
  if (stat.isDirectory()) {
    if ((stat.mode & 0o005) !== 0o005) return true;
    return readdirSync(path).some(entry =>
      needsRuntimeReadableCopy(join(path, entry))
    );
  }
  if (!stat.isFile()) return false;
  const needsRead = (stat.mode & 0o044) !== 0o044;
  const needsExecute =
    (stat.mode & 0o111) !== 0 && (stat.mode & 0o011) !== 0o011;
  return needsRead || needsExecute;
}

/**
 * CNB preserves the app directory's source modes in the final image, which
 * launches as an unprivileged user. Repositories created under a restrictive
 * umask can contain 0700 directories or 0600 files, so stage those trees and
 * make the staged copy runtime-readable without mutating the user's checkout.
 *
 * Dev-only: the deploy path copies the app into the working container with
 * build-user ownership instead (see `buildAndPushWithLifecycle`).
 *
 * TODO: on Linux dev hosts the bind-mounted workspace is not writable by the
 * builder's build user, so buildpacks that write to the app dir (bundler
 * lockfile updates, rails-assets, ...) fail. Fix it the pack way — a named
 * volume populated by a root helper container (`docker volume create` →
 * helper `docker run` copy+chown → mount volume → `docker volume rm`) — not
 * a chown through the bind mount, which leaves files the unprivileged dev
 * process cannot delete. macOS Docker Desktop mounts are permissive, so dev
 * is unaffected there today.
 */
function prepareAppDirectory(workPath: string): PreparedAppDirectory {
  // Some unit-level builder callers use the filesystem root as a synthetic
  // workPath. It is never a valid app tree and cannot be staged beneath /tmp.
  if (dirname(workPath) === workPath) {
    return { workPath };
  }
  if (!needsRuntimeReadableCopy(workPath)) {
    return { workPath };
  }

  const stagingRoot = mkdtempSync(join(tmpdir(), 'vercel-cnb-app-'));
  const stagedWorkPath = join(stagingRoot, 'workspace');
  try {
    cpSync(workPath, stagedWorkPath, {
      recursive: true,
      verbatimSymlinks: true,
    });
    makeRuntimeReadable(stagedWorkPath);
  } catch (err) {
    rmSync(stagingRoot, { recursive: true, force: true });
    throw err;
  }
  debug(`staged restrictive buildpack app tree from ${workPath}`);
  return {
    workPath: stagedWorkPath,
    cleanup: () =>
      rmSync(stagingRoot, {
        recursive: true,
        force: true,
      }),
  };
}

/**
 * Write the user's build env where the buildpack spec reads it from: one
 * file per variable under the platform directory (`/platform/env/<KEY>`).
 * Plain process env on the lifecycle is not part of the buildpack build
 * contract and also leaks the whole map to every phase; the platform dir is
 * both spec-correct and scoped. World-readable so the lifecycle's unprivileged
 * builder user can read it across the container UID mapping.
 *
 * TODO: in dev this briefly exposes build env values (which may contain
 * secrets) to other local users via the world-readable tmpdir. Tightening
 * requires group-mapping the files to the builder user instead of 0644.
 */
function writePlatformEnvDir(
  buildEnv: Record<string, string> | undefined
): string | undefined {
  const entries = Object.entries(buildEnv ?? {});
  if (entries.length === 0) return undefined;
  const dir = mkdtempSync(join(tmpdir(), 'vercel-cnb-env-'));
  chmodSync(dir, 0o755);
  for (const [key, value] of entries) {
    const file = join(dir, key);
    writeFileSync(file, value);
    chmodSync(file, 0o644);
  }
  return dir;
}

/**
 * Merge the descriptor's launch defaults beneath the user's build env.
 * Defaults are encoded as `BPE_DEFAULT_<KEY>`, while an unprefixed user value
 * is copied to `BPE_<KEY>` so it is embedded in the image as a launch
 * override. The deploy path may also provide its process env as a fallback
 * for these declared keys when the platform omits them from `meta.buildEnv`.
 * Returns the merged env plus a log line per applied default.
 */
export function mergeDefaultBuildEnv(
  bp: BuildpackDescriptor,
  buildEnv: Record<string, string> | undefined,
  processEnv?: NodeJS.ProcessEnv
): { buildEnv: Record<string, string> | undefined; applied: string[] } {
  const buildDefaults = Object.entries(bp.buildEnvDefaults ?? {});
  const launchDefaults = Object.entries(bp.launchEnvDefaults ?? {});
  if (buildDefaults.length === 0 && launchDefaults.length === 0) {
    return { buildEnv, applied: [] };
  }
  const merged = { ...(buildEnv ?? {}) };
  const applied: string[] = [];
  for (const [buildKey, value] of buildDefaults) {
    if (buildKey in merged) continue;
    merged[buildKey] = value;
    applied.push(
      `Defaulting ${buildKey}=${value} (set the ${buildKey} environment variable to override)`
    );
  }
  for (const [launchKey, value] of launchDefaults) {
    const defaultKey = `BPE_DEFAULT_${launchKey}`;
    const embeddedKey = `BPE_${launchKey}`;
    const overrideKey = `BPE_OVERRIDE_${launchKey}`;
    if (embeddedKey in merged || overrideKey in merged) continue;
    if (launchKey in merged) {
      merged[embeddedKey] = merged[launchKey];
      continue;
    }
    if (defaultKey in merged) continue;
    const processValue = processEnv?.[launchKey];
    if (typeof processValue === 'string') {
      merged[launchKey] = processValue;
      merged[embeddedKey] = processValue;
      continue;
    }
    merged[defaultKey] = value;
    applied.push(
      `Defaulting ${launchKey}=${value} (set the ${launchKey} environment variable to override)`
    );
  }
  return { buildEnv: merged, applied };
}

function shellEscape(arg: string): string {
  return /^[A-Za-z0-9_/.=:@%^+-]+$/.test(arg)
    ? arg
    : `'${arg.replace(/'/g, `'\\''`)}'`;
}

/**
 * Explain a CNB lifecycle/creator exit code in terms of the phase that
 * failed, so failures point at the right part of the build output instead of
 * a bare number. Codes per `buildpacks/lifecycle` `platform/exit.go`.
 */
export function describeCreatorExitCode(
  code: number | undefined
): string | undefined {
  if (code === undefined) return undefined;
  if (code === 20) return 'no buildpack detected the app';
  if (code === 21)
    return 'no buildpack detected the app and at least one errored during detection';
  if (code >= 22 && code <= 29) return 'the detect phase failed';
  if (code >= 30 && code <= 39) return 'the analyze phase failed';
  if (code >= 40 && code <= 49) return 'the restore phase failed';
  if (code === 51)
    return 'a buildpack failed while building the app (e.g. installing dependencies) — its error is in the build output above';
  if (code >= 50 && code <= 59) return 'the build phase failed';
  if (code >= 60 && code <= 69)
    return 'the export phase failed to write the image';
  return undefined;
}

/** In-container mount point for the generated `order.toml`. */
const ORDER_MOUNT_DIR = '/platform/order';
const ORDER_FILE = `${ORDER_MOUNT_DIR}/order.toml`;

/**
 * Write the descriptor's buildpack group as an explicit `order.toml` for the
 * creator, replacing the builder's full default order. Without it, detection
 * free-runs across every language family in the builder and a mixed-language
 * root (say a `go.mod` next to a `Gemfile`) could build as the wrong
 * language. World-readable for the same UID-mapping reason as the platform
 * env dir.
 */
function writeOrderDir(bp: BuildpackDescriptor): string {
  const order = {
    order: [
      {
        group: bp.buildpackGroup.map(entry => ({
          id: entry.id,
          version: entry.version,
          ...(entry.optional ? { optional: true } : {}),
        })),
      },
    ],
  };
  const dir = mkdtempSync(join(tmpdir(), 'vercel-cnb-order-'));
  chmodSync(dir, 0o755);
  const file = join(dir, 'order.toml');
  writeFileSync(file, stringifyToml(order));
  chmodSync(file, 0o644);
  return dir;
}

/**
 * Bake a `command` override into the image as its default `web` process by
 * writing a Procfile for Paketo's procfile buildpack to pick up. This is the
 * CNB-native mechanism: the resulting process runs through the launcher (so
 * buildpack-provided env like PATH is set) and lands in the image's OCI
 * config, which is what production reads to start the container. An existing
 * user Procfile is intentionally overwritten — explicit vercel.json config
 * wins over convention files.
 *
 * Only the deploy path does this: the Procfile is written to a temp dir and
 * copied into the working container on top of the app, so the source tree is
 * never mutated. In dev the command is applied at `docker run` time via the
 * launcher instead (see dev.ts).
 */
function writeCommandProcfile(
  workPath: string,
  command: string[],
  commandShell: boolean
): void {
  assertValidCommandShell(command, commandShell);
  // Mirror the CNB launcher's own convention: a command string is a shell
  // command line (left raw so $VARs and operators work), while an array is an
  // argv vector (each element escaped so the Procfile shell preserves it).
  const line = commandShell ? command[0] : command.map(shellEscape).join(' ');
  writeFileSync(join(workPath, 'Procfile'), `web: ${line}\n`);
  debug(`wrote Procfile web process from command override: ${line}`);
}

function unixSocketPath(host: string | undefined): string | undefined {
  if (!host?.startsWith('unix://')) return undefined;
  const socketPath = host.slice('unix://'.length);
  return socketPath && existsSync(socketPath) ? socketPath : undefined;
}

async function resolveDockerSocket(): Promise<string | undefined> {
  const configured = unixSocketPath(process.env.DOCKER_HOST);
  if (configured) return configured;
  if (existsSync('/var/run/docker.sock')) return '/var/run/docker.sock';
  try {
    const { stdout } = await run(
      'docker',
      ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'],
      { quiet: true }
    );
    return unixSocketPath(stdout.trim());
  } catch (err) {
    debug(`could not resolve Docker context socket: ${(err as Error).message}`);
    return undefined;
  }
}

/**
 * The run image to pre-pull for dev daemon builds: an explicit override or
 * pinned default, otherwise the run image declared by the overridden
 * builder's metadata.
 */
async function resolveDevRunImage(
  bp: BuildpackDescriptor,
  builder: string
): Promise<string> {
  const pinned = devRunImageRef(bp);
  if (pinned) return pinned;
  try {
    const { stdout } = await run(
      'docker',
      [
        'image',
        'inspect',
        builder,
        '--format',
        '{{ index .Config.Labels "io.buildpacks.builder.metadata" }}',
      ],
      { quiet: true }
    );
    const metadata = JSON.parse(stdout) as {
      stack?: { runImage?: { image?: unknown } };
      images?: Array<{ image?: unknown }>;
    };
    const image =
      metadata.stack?.runImage?.image ?? metadata.images?.[0]?.image;
    if (typeof image === 'string' && image) return image;
  } catch (err) {
    debug(
      `could not read run image metadata from ${builder}: ${
        (err as Error).message
      }`
    );
  }
  // An overridden builder may target a different stack; pairing it with the
  // pinned default run image would produce a broken image. Require an
  // explicit run image instead of guessing.
  throw new Error(
    `Could not determine the run image for builder ${builder}. Set ` +
      `VERCEL_BUILDPACK_${bp.runtime.toUpperCase()}_RUN_IMAGE to the run ` +
      'image matching that builder.'
  );
}

async function dockerImagePlatform(image: string): Promise<string | undefined> {
  try {
    const { stdout } = await run(
      'docker',
      ['image', 'inspect', image, '--format', '{{.Os}}/{{.Architecture}}'],
      { quiet: true }
    );
    const platform = stdout.trim();
    return /^linux\/[a-z0-9_]+$/i.test(platform) ? platform : undefined;
  } catch (err) {
    debug(`could not read platform from ${image}: ${(err as Error).message}`);
    return undefined;
  }
}

/**
 * Build a service root into the local Docker daemon for `vercel dev`.
 */
export async function buildWithLifecycle(
  bp: BuildpackDescriptor,
  params: LifecycleBuildParams,
  out: DevOutput,
  span?: Span
): Promise<{ tag: string; builder: string }> {
  return withSpan(
    span,
    'container.buildpack.lifecycle_build',
    { 'buildpack.runtime': bp.runtime, 'image.tag': params.tag },
    async s => {
      const builder = params.builder ?? devBuilderImageRef(bp);
      s?.setAttributes({ 'buildpack.builder': builder });

      emit(out, `  → Pulling ${bp.runtime} buildpack builder ${builder}`);
      await run('docker', ['pull', builder], { quiet: false, output: out });
      emit(out, `  ✓ builder ready: ${builder}`);

      // Keep every image in the lifecycle chain on the builder's platform.
      // Paketo's pinned builder is amd64-only while its run image is
      // multi-arch; without this, Apple Silicon creates an arm64 base with
      // amd64 Ruby layers that cannot launch.
      const platform = await dockerImagePlatform(builder);
      const platformFlags = platform ? ['--platform', platform] : [];
      if (platform) {
        s?.setAttributes({ 'buildpack.platform': platform });
      }

      const runImage = await resolveDevRunImage(bp, builder);
      emit(out, `  → Pulling buildpack run image ${runImage}`);
      await run('docker', ['pull', ...platformFlags, runImage], {
        quiet: false,
        output: out,
      });
      emit(out, `  ✓ run image ready: ${runImage}`);

      const appDirectory = prepareAppDirectory(params.workPath);
      const defaultedEnv = mergeDefaultBuildEnv(bp, params.buildEnv);
      for (const line of defaultedEnv.applied) {
        emit(out, `  ${line}`);
      }
      const platformEnvDir = writePlatformEnvDir(defaultedEnv.buildEnv);
      const platformEnvMount = platformEnvDir
        ? ['-v', `${platformEnvDir}:/platform/env:ro`]
        : [];
      const orderDir = writeOrderDir(bp);

      const dockerSocket = await resolveDockerSocket();
      const socketMount = dockerSocket
        ? ['-v', `${dockerSocket}:/var/run/docker.sock`]
        : [];
      const args = [
        'run',
        ...platformFlags,
        '--rm',
        // The creator's analyzer/exporter need access to the mounted Docker
        // socket; lifecycle drops detect/build to the builder user.
        '--user',
        'root',
        '-e',
        'CNB_PLATFORM_API=0.13',
        '-v',
        `${appDirectory.workPath}:/workspace`,
        '-v',
        `${orderDir}:${ORDER_MOUNT_DIR}:ro`,
        ...platformEnvMount,
        ...socketMount,
        builder,
        '/cnb/lifecycle/creator',
        '-app=/workspace',
        `-order=${ORDER_FILE}`,
        // TODO: replace -skip-restore with a persistent -cache-dir volume
        // (namespaced by service and builder digest, under meta.devCacheDir)
        // so dev rebuilds don't re-run full dependency installs.
        '-skip-restore',
        `-run-image=${runImage}`,
        '-daemon',
        params.tag,
      ];

      emit(out, `  → Building ${params.tag} with ${bp.runtime} buildpacks`);
      try {
        const { spawn } = await import('node:child_process');
        await new Promise<void>((resolve, reject) => {
          const child = spawn('docker', args, {
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          child.stdout?.on('data', (chunk: Buffer) => {
            if (out.onStdout) out.onStdout(chunk);
            else process.stderr.write(chunk.toString());
          });
          child.stderr?.on('data', (chunk: Buffer) => {
            if (out.onStderr) out.onStderr(chunk);
            else process.stderr.write(chunk.toString());
          });
          child.on('error', (err: NodeJS.ErrnoException) => {
            reject(
              err.code === 'ENOENT'
                ? new Error(
                    'Command not found: `docker`. Docker is required for buildpack development.'
                  )
                : err
            );
          });
          child.on('close', code => {
            if (code === 0) {
              resolve();
              return;
            }
            const hint = describeCreatorExitCode(code ?? undefined);
            reject(
              new Error(
                `\`docker run\` exited with code ${code}` +
                  (hint ? ` (${hint})` : '')
              )
            );
          });
        });
      } finally {
        if (platformEnvDir) {
          rmSync(platformEnvDir, { recursive: true, force: true });
        }
        rmSync(orderDir, { recursive: true, force: true });
        appDirectory.cleanup?.();
      }

      emit(out, `  ✓ built ${params.tag} via ${bp.runtime} buildpacks`);
      return { tag: params.tag, builder };
    }
  );
}

function registryAuth(
  registry: string,
  username: string,
  token: string
): string {
  const basic = Buffer.from(`${username}:${token}`).toString('base64');
  return JSON.stringify({ [registry]: `Basic ${basic}` });
}

async function runBuildah(
  args: string[],
  env?: NodeJS.ProcessEnv,
  opts: { quiet?: boolean } = {}
): Promise<RunResult> {
  const storageArgs = await buildahStorageArgs();
  return run('buildah', [...storageArgs, ...args], {
    quiet: opts.quiet ?? false,
    env,
  });
}

/**
 * The builder's build uid:gid, read from the builder image's own
 * `CNB_USER_ID`/`CNB_GROUP_ID` env via the working container. `pack` chowns
 * the app directory to this user, and buildpacks assume the workspace is
 * writable by it (bundler rewrites Gemfile.lock, rails-assets writes
 * public/assets, npm rewrites lockfiles, ...).
 */
async function resolveBuildUser(containerName: string): Promise<string> {
  const { stdout } = await runBuildah(
    [
      'run',
      // Host networking like the creator run below: the build sandbox
      // cannot set up bridge networking (netavark/iptables).
      '--network',
      'host',
      containerName,
      '--',
      'sh',
      '-c',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion inside the container
      'echo "${CNB_USER_ID:-1000}:${CNB_GROUP_ID:-1000}"',
    ],
    undefined,
    { quiet: true }
  );
  const user = stdout.trim().split('\n').at(-1) ?? '';
  return /^\d+:\d+$/.test(user) ? user : '1000:1000';
}

/**
 * Run the trusted CNB builder as a Buildah working container and have the
 * lifecycle export the app image directly to VCR.
 */
export async function buildAndPushWithLifecycle(
  bp: BuildpackDescriptor,
  params: LifecycleRegistryBuildParams,
  span?: Span
): Promise<LifecycleRegistryBuildResult> {
  return withSpan(
    span,
    'container.buildpack.lifecycle_registry_build',
    { 'buildpack.runtime': bp.runtime, 'image.ref': params.imageRef },
    async s => {
      // Deploys always run the descriptor's pinned, digest-reviewed images.
      // The `VERCEL_BUILDPACK_*` env overrides are a dev/testing tool only —
      // in production they would be reachable through user-supplied build
      // env — so a digest change ships through a normal `@vercel/container`
      // release instead.
      const builder = params.builder ?? bp.builder;
      const runImage = bp.runImage;
      const containerName = `vercel-cnb-${bp.runtime}-${process.pid}-${Date.now().toString(36)}`;
      // The exporter runs as the builder's unprivileged user; the report dir
      // must be writable across the container UID mapping.
      const reportDir = mkdtempSync(join(tmpdir(), 'vercel-cnb-report-'));
      const reportPath = join(reportDir, 'report.toml');
      chmodSync(reportDir, 0o777);
      const defaultedEnv = mergeDefaultBuildEnv(
        bp,
        params.buildEnv,
        process.env
      );
      for (const line of defaultedEnv.applied) {
        write(`  ${line}`);
      }
      const platformEnvDir = writePlatformEnvDir(defaultedEnv.buildEnv);
      const orderDir = writeOrderDir(bp);

      let procfileDir: string | undefined;
      if (params.command?.length) {
        // Validate before allocating the temp dir so a rejected command
        // doesn't leak it (the cleanup below only runs after the try).
        assertValidCommandShell(params.command, params.commandShell ?? false);
        procfileDir = mkdtempSync(join(tmpdir(), 'vercel-cnb-procfile-'));
        writeCommandProcfile(
          procfileDir,
          params.command,
          params.commandShell ?? false
        );
      }

      try {
        step(
          `Preparing ${bp.runtime} buildpack builder ${builder} with Buildah`
        );
        await runBuildah([
          'from',
          '--platform',
          TARGET_PLATFORM,
          '--name',
          containerName,
          builder,
        ]);

        // Copy the app into the working container instead of bind-mounting
        // it, owned by the build user — the environment pack provides and
        // buildpacks are written against. This makes /workspace writable
        // during the build and exports the app layer with build-user
        // ownership instead of the host uid's.
        const buildUser = await resolveBuildUser(containerName);
        await runBuildah([
          'copy',
          '--chown',
          buildUser,
          containerName,
          params.workPath,
          '/workspace',
        ]);
        if (procfileDir) {
          // Explicit vercel.json `command` wins over a user-authored Procfile.
          await runBuildah([
            'copy',
            '--chown',
            buildUser,
            containerName,
            join(procfileDir, 'Procfile'),
            '/workspace/Procfile',
          ]);
        }

        const lifecycleEnv: NodeJS.ProcessEnv = {
          ...process.env,
          CNB_REGISTRY_AUTH: registryAuth(
            params.registry,
            params.username,
            params.token
          ),
        };
        const envFlags = [
          '--env',
          'CNB_PLATFORM_API=0.13',
          '--env',
          'CNB_REGISTRY_AUTH',
        ];
        const platformEnvMount = platformEnvDir
          ? ['--volume', `${platformEnvDir}:/platform/env`]
          : [];

        step(
          `Building and publishing ${params.imageRef} via ${bp.runtime} buildpacks`
        );
        await runBuildah(
          [
            'run',
            '--network',
            'host',
            '--volume',
            `${reportDir}:/platform-output`,
            '--volume',
            `${orderDir}:${ORDER_MOUNT_DIR}`,
            ...platformEnvMount,
            ...envFlags,
            containerName,
            '--',
            '/cnb/lifecycle/creator',
            '-app=/workspace',
            `-order=${ORDER_FILE}`,
            // TODO: replace -skip-restore with a persistent -cache-dir
            // (namespaced by service and builder digest) wired into
            // prepareCache so deploy rebuilds restore dependency layers.
            '-skip-restore',
            ...(runImage ? [`-run-image=${runImage}`] : []),
            '-report=/platform-output/report.toml',
            params.imageRef,
          ],
          lifecycleEnv
        );

        const report = readFileSync(reportPath, 'utf8');
        const digest = report.match(DIGEST_RE)?.[0];
        if (!digest) {
          throw new Error(
            `${bp.runtime} buildpack lifecycle did not report a digest.`
          );
        }
        done(`built and published ${params.imageRef}@${digest}`);
        s?.setAttributes({
          'buildpack.builder': builder,
          'image.digest': digest,
        });
        return { imageRef: params.imageRef, digest, builder };
      } catch (err) {
        const hint = describeCreatorExitCode((err as RunError).exitCode);
        throw new Error(
          [
            `${bp.runtime} buildpack build failed via lifecycle/creator (${builder}).`,
            ...(hint
              ? [
                  `The lifecycle exited with code ${(err as RunError).exitCode}: ${hint}.`,
                ]
              : []),
            '',
            `Underlying error: ${(err as Error).message}`,
            '',
            `Buildpack project is ${params.workPath}`,
          ].join('\n')
        );
      } finally {
        try {
          await runBuildah(['rm', containerName]);
        } catch (err) {
          debug(
            `could not remove Buildah CNB container ${containerName}: ${
              (err as Error).message
            }`
          );
        }
        rmSync(reportDir, { recursive: true, force: true });
        if (platformEnvDir) {
          rmSync(platformEnvDir, { recursive: true, force: true });
        }
        rmSync(orderDir, { recursive: true, force: true });
        if (procfileDir) {
          rmSync(procfileDir, { recursive: true, force: true });
        }
      }
    }
  );
}
