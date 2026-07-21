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
import { DIGEST_RE, TARGET_PLATFORM } from '../engines/types';
import { buildahStorageArgs } from '../storage-driver';
import type { DevOutput } from '../util';
import { debug, done, run, step, withSpan } from '../util';
import type { BuildpackDescriptor } from './registry';
import { builderImageRef, runImageRef } from './registry';

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

function shellEscape(arg: string): string {
  return /^[A-Za-z0-9_/.=:@%^+-]+$/.test(arg)
    ? arg
    : `'${arg.replace(/'/g, `'\\''`)}'`;
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
 * Only the deploy path does this: `workPath` there is the build sandbox. In
 * dev, `workPath` is the developer's source tree, so the command is applied
 * at `docker run` time via the launcher instead (see dev.ts).
 */
function writeCommandProcfile(
  workPath: string,
  command: string[],
  commandShell: boolean
): void {
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
 * The run image to pre-pull for dev daemon builds: an explicit override, the
 * run image declared by the (possibly overridden) builder's metadata, or the
 * descriptor's pinned default.
 */
async function resolveDevRunImage(
  bp: BuildpackDescriptor,
  builder: string
): Promise<string> {
  const pinned = runImageRef(bp);
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
  return bp.runImage;
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
      const builder = params.builder ?? builderImageRef(bp);
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
      const platformEnvDir = writePlatformEnvDir(params.buildEnv);
      const platformEnvMount = platformEnvDir
        ? ['-v', `${platformEnvDir}:/platform/env:ro`]
        : [];

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
        ...platformEnvMount,
        ...socketMount,
        builder,
        '/cnb/lifecycle/creator',
        '-app=/workspace',
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
            if (code === 0) resolve();
            else reject(new Error(`\`docker run\` exited with code ${code}`));
          });
        });
      } finally {
        if (platformEnvDir) {
          rmSync(platformEnvDir, { recursive: true, force: true });
        }
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
  env?: NodeJS.ProcessEnv
): Promise<void> {
  const storageArgs = await buildahStorageArgs();
  await run('buildah', [...storageArgs, ...args], { quiet: false, env });
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
      const builder = params.builder ?? builderImageRef(bp);
      const runImage = runImageRef(bp);
      const containerName = `vercel-cnb-${bp.runtime}-${process.pid}-${Date.now().toString(36)}`;
      // The exporter runs as the builder's unprivileged user; the report dir
      // must be writable across the container UID mapping.
      const reportDir = mkdtempSync(join(tmpdir(), 'vercel-cnb-report-'));
      const reportPath = join(reportDir, 'report.toml');
      chmodSync(reportDir, 0o777);
      const platformEnvDir = writePlatformEnvDir(params.buildEnv);

      if (params.command?.length) {
        writeCommandProcfile(
          params.workPath,
          params.command,
          params.commandShell ?? false
        );
      }
      const appDirectory = prepareAppDirectory(params.workPath);

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
            `${appDirectory.workPath}:/workspace`,
            '--volume',
            `${reportDir}:/platform-output`,
            ...platformEnvMount,
            ...envFlags,
            containerName,
            '--',
            '/cnb/lifecycle/creator',
            '-app=/workspace',
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
        throw new Error(
          [
            `${bp.runtime} buildpack build failed via lifecycle/creator (${builder}).`,
            '',
            `Underlying error: ${(err as Error).message}`,
            '',
            `Buildpack project is ${params.workPath}`,
          ].join('\n')
        );
      } finally {
        try {
          await runBuildah(['rm', '--force', containerName]);
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
        appDirectory.cleanup?.();
      }
    }
  );
}
