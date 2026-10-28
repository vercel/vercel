import type { BuildOptions, Files, Span } from '@vercel/build-utils';
import {
  download,
  FileBlob,
  getSymlinkTarget,
  isSymbolicLink,
  streamToBuffer,
} from '@vercel/build-utils';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
  win32,
} from 'node:path';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { extract as extractTar } from 'tar';
import type { RegistryCredentials } from '../../engines/types';
import { DIGEST_RE } from '../../engines/types';
import type { RunError } from '../../util';
import { debug } from '../../util';
import type { PinnedArchive } from '../distribution';
import { vercelBuildpackArtifact, LIFECYCLE } from '../distribution';
import type { BuildpackRuntime, RuntimeImage } from '../registry';
import type { NodeToolchain } from '../node-toolchain';

export interface LifecycleRegistryBuildParams {
  /** A materialized, self-contained snapshot of the filtered source files. */
  workPath: string;
  buildEnv?: Record<string, string>;
  image: RuntimeImage;
  imageRef: string;
  /** The same credentials `engine.login()` validated. */
  credentials: RegistryCredentials;
  /** Buildah can overlap registry setup; omit if already prepared. */
  prepareRegistry?: () => Promise<void>;
  nodeToolchain?: NodeToolchain;
  /** Passed to the buildpack as `VERCEL_ENTRYPOINT`. */
  entrypoint?: string;
  /** Passed to the buildpack as `VERCEL_COMMAND`. */
  command?: string[];
  /**
   * Where this application's CNB directory cache is persisted. Absent when
   * caching is disabled; the creator then runs with `-skip-restore`.
   */
  cache?: { dir: string };
}

export interface LifecycleRegistryBuildResult {
  imageRef: string;
  digest: string;
  buildImage: string;
  runImage: string;
  runtimeVersion: string;
}

/** The interface every lifecycle runner implements. */
export type LifecycleRunner = (
  buildpack: BuildpackRuntime,
  params: LifecycleRegistryBuildParams,
  span?: Span
) => Promise<LifecycleRegistryBuildResult>;

// The lifecycle refuses to run as root. 1001 rather than the conventional
// 1000, which stock images often assign to their default user. Must match the
// harness in vercel/buildpacks.
// TODO: remove this once we add this user to the build-container
export const BUILD_USER_ID = 1001;
export const BUILD_GROUP_ID = 1001;
export const BUILD_USER = `${BUILD_USER_ID}:${BUILD_GROUP_ID}`;
/**
 * Platform API 0.15 (lifecycle 0.21.x). At least 0.14 is required for the
 * restorer to bring back `launch=true, cache=true` layers from the directory
 * cache when the output tag has no previous image. Must match the harness in
 * vercel/buildpacks.
 */
export const CNB_PLATFORM_API = '0.15';
export const ORDER_MOUNT_DIR = '/platform/order';
export const ORDER_FILE = `${ORDER_MOUNT_DIR}/order.toml`;
/** The lifecycle's `-cache-dir`, a fresh writable directory per invocation. */
export const CACHE_MOUNT_DIR = '/cache';

// Env names become file names under /platform/env; reject anything that
// could escape the directory.
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The exporter ships the entire app directory. Materialize only the caller's
 * filtered sources, never the live work tree or restored build caches.
 */
export async function stageWorkspace(
  { files, workPath }: Pick<BuildOptions, 'files' | 'workPath'>,
  destinationDir: string
): Promise<void> {
  const staged: Files = Object.create(null);
  const symlinks = new Set<string>();
  for (const [name, file] of Object.entries(files)) {
    const portable = name.replace(/\\/g, '/');
    const normalized = posix.normalize(portable).replace(/\/$/, '');
    if (
      !normalized ||
      normalized === '.' ||
      win32.isAbsolute(name) ||
      posix.isAbsolute(portable) ||
      portable.split('/').includes('..') ||
      normalized in staged
    ) {
      throw new Error(`Invalid buildpack source path ${JSON.stringify(name)}.`);
    }
    staged[normalized] = file;
    if (!isSymbolicLink(file.mode)) continue;

    let target = getSymlinkTarget(file);
    if (target === null && file.type === 'FileRef') {
      target = (await streamToBuffer(await file.toStreamAsync())).toString();
    }
    if (!target) {
      throw new Error(`Cannot read buildpack source symlink ${name}.`);
    }
    if (isAbsolute(target)) {
      target =
        relative(resolve(workPath, posix.dirname(normalized)), target) || '.';
    } else if (win32.isAbsolute(target)) {
      throw new Error(
        `Buildpack source symlink ${name} has an absolute target.`
      );
    }
    target = target.replace(/\\/g, '/');
    const resolved = posix.join(posix.dirname(normalized), target);
    if (resolved === '..' || resolved.startsWith('../')) {
      throw new Error(
        `Buildpack source symlink ${name} escapes the service root. Buildpack services must be self-contained.`
      );
    }
    staged[normalized] = new FileBlob({ data: target, mode: file.mode });
    symlinks.add(normalized);
  }
  // Never let concurrent downloads write through a source symlink.
  for (const name of Object.keys(staged)) {
    for (
      let parent = posix.dirname(name);
      parent !== '.';
      parent = posix.dirname(parent)
    ) {
      if (symlinks.has(parent)) {
        throw new Error(
          `Buildpack source ${name} is inside symlink ${parent}.`
        );
      }
    }
    const file = staged[name];
    if (file.type === 'FileFsRef' && !isSymbolicLink(file.mode)) {
      const sourcePath = resolve(file.fsPath);
      const sourceRelative = relative(resolve(workPath), sourcePath);
      if (
        sourceRelative.startsWith(`..${sep}`) ||
        sourceRelative === '..' ||
        isAbsolute(sourceRelative)
      ) {
        continue;
      }
      // Local CLI enumeration follows symlinks and reports the target's mode.
      // Do not import excluded targets through regular-mode FileFsRefs, including
      // files reached through symlinked directories.
      const sourceRoot = realpathSync.native(workPath);
      const sourceTarget = realpathSync.native(sourcePath);
      if (sourceTarget !== resolve(sourceRoot, sourceRelative)) {
        const target = relative(sourceRoot, sourceTarget).split(sep).join('/');
        if (
          target === '..' ||
          target.startsWith('../') ||
          isAbsolute(target) ||
          !(target in staged)
        ) {
          throw new Error(
            `Buildpack source ${name} follows a symlink to an excluded or outside-root file. Buildpack services must be self-contained.`
          );
        }
      }
    }
  }
  // This is a fresh destination even when the caller sets skipDownload/isDev.
  await download(staged, destinationDir);
  const root = realpathSync.native(destinationDir);
  for (const name of symlinks) {
    let target: string;
    try {
      target = relative(root, realpathSync.native(join(destinationDir, name)));
    } catch {
      throw new Error(
        `Buildpack source symlink ${name} has no target in the staged service.`
      );
    }
    // Resolve chains as well as individual links before any container sees them.
    if (
      target === '..' ||
      target.startsWith(`..${sep}`) ||
      isAbsolute(target)
    ) {
      throw new Error(
        `Buildpack source symlink ${name} escapes the staged service.`
      );
    }
  }
}

/**
 * Write the CNB platform environment. The platform API delivers user env as a
 * directory of files (name = variable, content = value); the lifecycle does
 * not forward its own process env to buildpacks, so `--env` would not work.
 * The platform owns `VERCEL_NODE_HOME`, `VERCEL_ENTRYPOINT`, and
 * `VERCEL_COMMAND`, so the project's build env can't set them.
 */
export function writePlatformEnvDir(
  buildEnv: Record<string, string> | undefined,
  config: {
    nodeHome?: string;
    /** The root-relative program to build; without it, the buildpack discovers one. */
    entrypoint?: string;
    /** The default process argv, starting with the executable's name. */
    command?: string[];
  },
  parentDir: string = tmpdir()
): string {
  const environment: Record<string, string> = { ...buildEnv };
  delete environment.VERCEL_NODE_HOME;
  delete environment.VERCEL_ENTRYPOINT;
  delete environment.VERCEL_COMMAND;
  if (config.nodeHome) {
    environment.VERCEL_NODE_HOME = config.nodeHome;
  }
  if (config.entrypoint) {
    environment.VERCEL_ENTRYPOINT = config.entrypoint;
  }
  if (config.command) {
    environment.VERCEL_COMMAND = JSON.stringify(config.command);
  }
  const dir = mkdtempSync(join(parentDir, 'vercel-cnb-env-'));
  chmodSync(dir, 0o755);
  for (const [key, value] of Object.entries(environment)) {
    if (!ENV_NAME_RE.test(key)) {
      debug(`skipping build env var with an unsupported name: ${key}`);
      continue;
    }
    const file = join(dir, key);
    writeFileSync(file, value);
    chmodSync(file, 0o644);
  }
  return dir;
}

/**
 * Read the exported image digest from the lifecycle's `report.toml`. Parsed
 * as TOML so no other digest-shaped field can be mistaken for it.
 */
export function readReportDigest(report: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = parseToml(report);
  } catch {
    return undefined;
  }
  const digest = (parsed as { image?: { digest?: unknown } })?.image?.digest;
  if (typeof digest !== 'string' || !DIGEST_RE.test(digest)) {
    return undefined;
  }
  return digest;
}

/** The creator's exit code when a buildpack fails, after printing its error. */
export const BUILDPACK_FAILED_EXIT_CODE = 51;

export function describeCreatorExitCode(
  code: number | undefined
): string | undefined {
  if (code === undefined) return undefined;
  if (code === 20) return 'no buildpack detected the app';
  if (code === 21) {
    return 'no buildpack detected the app and at least one errored during detection';
  }
  if (code >= 22 && code <= 29) return 'the detect phase failed';
  if (code >= 30 && code <= 39) return 'the analyze phase failed';
  if (code >= 40 && code <= 49) return 'the restore phase failed';
  if (code === BUILDPACK_FAILED_EXIT_CODE) {
    return 'a buildpack failed while building the app (e.g. installing dependencies) — its error is in the build output above';
  }
  if (code >= 50 && code <= 59) return 'the build phase failed';
  if (code >= 60 && code <= 69) {
    return 'the export phase failed to write the image';
  }
  return undefined;
}

/**
 * Records a failed lifecycle run on its span and returns the error to throw.
 * The error keeps the run's exit code, so callers can tell a buildpack's own
 * failure.
 */
export function lifecycleFailure(
  error: unknown,
  context: {
    buildpack: BuildpackRuntime;
    /** How the lifecycle ran, such as `docker`. */
    via: string;
    buildImage: string;
    workPath: string;
    span?: Span;
  }
): RunError {
  const exitCode = (error as RunError).exitCode;
  const hint = describeCreatorExitCode(exitCode);
  context.span?.setAttributes({
    ...(exitCode !== undefined
      ? { 'buildpack.lifecycle.exit_code': String(exitCode) }
      : {}),
    ...(hint ? { 'buildpack.lifecycle.failure_phase': hint } : {}),
  });
  return Object.assign(
    new Error(
      [
        `${context.buildpack.runtime} buildpack build failed via ${context.via} (${context.buildImage}).`,
        ...(hint
          ? [`The lifecycle exited with code ${exitCode}: ${hint}.`]
          : []),
        '',
        `Underlying error: ${(error as Error).message}`,
        '',
        `Buildpack project is ${context.workPath}`,
      ].join('\n')
    ),
    { exitCode }
  );
}

export function writeOrderDir(
  buildpack: BuildpackRuntime,
  parentDir: string = tmpdir()
): string {
  const order = {
    order: [
      {
        group: buildpack.buildpacks.map(entry => ({
          id: entry.id,
          version: entry.version,
        })),
      },
    ],
  };
  const dir = mkdtempSync(join(parentDir, 'vercel-cnb-order-'));
  chmodSync(dir, 0o755);
  const file = join(dir, 'order.toml');
  writeFileSync(file, stringifyToml(order));
  chmodSync(file, 0o644);
  return dir;
}

/**
 * The `CNB_REGISTRY_AUTH` value (CNB Platform API): a JSON map of registry to
 * `Authorization` header. The lifecycle exports from inside the build
 * container and cannot read the host engine's auth store, so the credentials
 * `engine.login()` validated are handed to it explicitly.
 */
export function cnbRegistryAuth(credentials: RegistryCredentials): string {
  const { registry, username, token } = credentials;
  const basic = Buffer.from(`${username}:${token}`).toString('base64');
  return JSON.stringify({ [registry]: `Basic ${basic}` });
}

export function distributionUrls(buildpack: BuildpackRuntime): {
  lifecycle: string;
  buildpacks: string[];
} {
  return {
    lifecycle: LIFECYCLE.url,
    buildpacks: buildpack.buildpacks.map(
      entry => vercelBuildpackArtifact(entry).url
    ),
  };
}

/** Names an archive in build output without revealing where it is hosted. */
function archiveName(archive: PinnedArchive): string {
  return new URL(archive.url).pathname.split('/').at(-1) || 'archive';
}

/** Download an archive and verify it against its pinned checksum. */
async function downloadPinnedArchive(
  archive: PinnedArchive,
  destinationPath: string
): Promise<void> {
  const response = await fetch(archive.url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${archiveName(archive)}: HTTP ${response.status} ${response.statusText}`
    );
  }

  const contents = new Uint8Array(await response.arrayBuffer());
  const checksum = createHash('sha256').update(contents).digest('hex');
  if (checksum !== archive.sha256) {
    throw new Error(
      `Checksum mismatch for ${archiveName(archive)}: expected ${archive.sha256}, received ${checksum}.`
    );
  }
  writeFileSync(destinationPath, contents);
}

/** Fetch a plain (optionally gzipped) tarball and extract it into `destinationDir`. */
export async function fetchPinnedArchive(
  archive: PinnedArchive,
  destinationDir: string
): Promise<void> {
  const archivePath = join(destinationDir, `${archive.sha256}.tgz`);
  try {
    await downloadPinnedArchive(archive, archivePath);
    // Async tar extraction deadlocks on the lifecycle's creator -> lifecycle
    // symlink: its target name collides with a parent path reservation.
    extractTar({ file: archivePath, cwd: destinationDir, sync: true });
  } finally {
    rmSync(archivePath, { force: true });
  }
}

interface OciDescriptor {
  mediaType?: string;
  digest?: string;
}

const LAYER_MEDIA_TYPE_RE = /(\.tar\.gzip|\.tar\+gzip|\.tar)$/;

function readOciJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function blobPath(layoutDir: string, digest: string): string {
  const match = digest.match(/^sha256:([0-9a-f]{64})$/);
  if (!match) {
    throw new Error(`Unsupported OCI digest ${JSON.stringify(digest)}.`);
  }
  return join(layoutDir, 'blobs', 'sha256', match[1]);
}

/**
 * Fetch a packaged buildpack (`pack buildpack package --format file`) and lay
 * it out for the lifecycle. The `.cnb` is an OCI image layout whose layers
 * contain `/cnb/buildpacks/<id>/<version>/...`; each layer is verified against
 * its digest and extracted into `cnbDir` with the leading `cnb/` stripped.
 */
export async function fetchBuildpackage(
  archive: PinnedArchive,
  cnbDir: string
): Promise<void> {
  const layoutDir = mkdtempSync(join(tmpdir(), 'vercel-cnb-buildpackage-'));
  const archivePath = join(layoutDir, 'buildpackage.cnb');
  try {
    await downloadPinnedArchive(archive, archivePath);
    await extractTar({ file: archivePath, cwd: layoutDir });

    const index = readOciJson<{ manifests?: OciDescriptor[] }>(
      join(layoutDir, 'index.json')
    );
    const name = archiveName(archive);
    const manifestDigest = index.manifests?.[0]?.digest;
    if (!manifestDigest) {
      throw new Error(`${name} has no image manifest in index.json.`);
    }
    const manifest = readOciJson<{ layers?: OciDescriptor[] }>(
      blobPath(layoutDir, manifestDigest)
    );
    if (!manifest.layers?.length) {
      throw new Error(`${name} has an image manifest with no layers.`);
    }

    for (const layer of manifest.layers) {
      if (!layer.digest || !LAYER_MEDIA_TYPE_RE.test(layer.mediaType ?? '')) {
        throw new Error(
          `${name} has an unsupported layer media type ${JSON.stringify(
            layer.mediaType
          )}.`
        );
      }
      const layerPath = blobPath(layoutDir, layer.digest);
      const actual = createHash('sha256')
        .update(new Uint8Array(readFileSync(layerPath)))
        .digest('hex');
      if (`sha256:${actual}` !== layer.digest) {
        throw new Error(
          `${name} layer ${layer.digest} hashes to sha256:${actual}.`
        );
      }
      // pack emits absolute /cnb paths. Normalize before tar's strip logic,
      // while keeping its traversal and symlink protections enabled.
      await extractTar({
        file: layerPath,
        cwd: cnbDir,
        strict: true,
        filter: (_path, entry) => {
          if (!('path' in entry)) return false;
          const match = entry.path.match(/^\/?cnb\/(buildpacks\/.*)$/);
          if (!match || match[1].split('/').includes('..')) {
            return false;
          }
          entry.path = match[1];
          if (entry.type === 'Link' && entry.linkpath) {
            entry.linkpath = entry.linkpath.replace(/^\/?cnb\//, '');
          }
          return true;
        },
      });
    }
  } finally {
    rmSync(layoutDir, { recursive: true, force: true });
  }
}

/** Fetch the lifecycle and every buildpack in the group into `cnbDir`. */
export async function fetchDistribution(
  buildpack: BuildpackRuntime,
  cnbDir: string
): Promise<void> {
  await Promise.all([
    fetchPinnedArchive(LIFECYCLE, cnbDir),
    ...buildpack.buildpacks.map(entry =>
      fetchBuildpackage(vercelBuildpackArtifact(entry), cnbDir)
    ),
  ]);
  for (const entry of buildpack.buildpacks) {
    const directory = join(
      cnbDir,
      'buildpacks',
      entry.id.replace('/', '_'),
      entry.version
    );
    for (const file of ['buildpack.toml', 'bin/detect', 'bin/build']) {
      if (
        !statSync(join(directory, file), { throwIfNoEntry: false })?.isFile()
      ) {
        throw new Error(
          `Buildpack ${entry.id}@${entry.version} is missing ${file}.`
        );
      }
    }
  }
}

/**
 * The creator's arguments. With a cache directory the restore phase runs
 * against it and the exporter commits cached layers back into it; without
 * one, layer analysis is skipped. `-launch-cache` is not used: it only speeds
 * up daemon exports. Parallel export requires a cache directory.
 */
export function creatorArgs(
  image: RuntimeImage,
  imageRef: string,
  options: { cacheDir?: string; debug?: boolean; parallelExport?: boolean } = {}
): string[] {
  return [
    '-app=/workspace',
    `-order=${ORDER_FILE}`,
    ...(options.debug ? ['-log-level=debug'] : []),
    ...(options.cacheDir
      ? [
          `-cache-dir=${options.cacheDir}`,
          ...(options.parallelExport ? ['-parallel'] : []),
        ]
      : ['-skip-restore']),
    `-run-image=${image.runImage}`,
    '-report=/platform-output/report.toml',
    imageRef,
  ];
}
