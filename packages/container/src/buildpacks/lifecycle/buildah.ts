import {
  chmodSync,
  chownSync,
  lchownSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import type { Span } from '@vercel/build-utils';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startContainerCleanup } from '../../buildah-store-cache/cleanup';
import { BuildahImageUsage } from '../../buildah-store-cache/usage';
import type { BuildahClient } from '../../clients/buildah';
import { TARGET_PLATFORM } from '../../engines/types';
import {
  DEBUG,
  debug,
  done,
  elapsed,
  isBuildContainer,
  step,
  withSpan,
} from '../../util';
import {
  describeRestore,
  describeSave,
  recordRestore,
  recordSave,
  restoreBuildpackCache,
  saveBuildpackCache,
  type BuildpackCacheRestore,
} from '../cache';
import type { BuildpackRuntime } from '../registry';
import type {
  LifecycleRegistryBuildParams,
  LifecycleRegistryBuildResult,
} from './lifecycle';
import {
  BUILD_GROUP_ID,
  BUILD_USER,
  BUILD_USER_ID,
  CACHE_MOUNT_DIR,
  CNB_PLATFORM_API,
  creatorArgs,
  distributionUrls,
  fetchDistribution,
  lifecycleFailure,
  ORDER_MOUNT_DIR,
  readReportDigest,
  cnbRegistryAuth,
  writeOrderDir,
  writePlatformEnvDir,
} from './lifecycle';

// Later service builds share the Buildah store.
async function cleanUpBuildContainer(name: string): Promise<void> {
  try {
    await startContainerCleanup(name);
  } catch (error) {
    debug(
      `could not clean up Buildah CNB container ${name}: ${(error as Error).message}`
    );
  }
}

/**
 * The image ID the working container was created from. A floating tag such as
 * `ruby:3.4` may move between builds; the ID identifies the actual base.
 */
async function inspectBaseImageId(
  container: string,
  client: BuildahClient
): Promise<string> {
  const { stdout } = await client.run(
    ['inspect', '--type', 'container', container],
    { quiet: true }
  );
  const inspected = JSON.parse(stdout) as {
    FromImageID?: string;
    FromImageDigest?: string;
  };
  const id = inspected.FromImageID || inspected.FromImageDigest;
  if (!id) {
    throw new Error(
      `buildah inspect did not report the base image of ${container}.`
    );
  }
  return id;
}

/**
 * Where the private, writable CNB cache directory lives while the creator
 * runs: on the build container, the `/vercel` volume that also holds the
 * Buildah store; elsewhere, the OS temp directory.
 */
function cacheScratchParent(): string {
  if (isBuildContainer()) {
    const dir = '/vercel/.cnb';
    try {
      mkdirSync(dir, { recursive: true });
      return dir;
    } catch (error) {
      debug(
        `cannot use ${dir} for the buildpack cache: ${(error as Error).message}`
      );
    }
  }
  return tmpdir();
}

/**
 * Give the CNB user ownership of the hydrated cache tree. It holds only
 * directories and regular files copied from the durable cache, and `lchown`
 * would not follow a link even if one appeared. Directories become 0755 and
 * files 0644 so the lifecycle can rename, read, and replace them.
 */
function chownTree(root: string, uid: number, gid: number): void {
  const stat = lstatSync(root);
  if (stat.isDirectory()) {
    chmodSync(root, 0o755);
    for (const entry of readdirSync(root)) {
      chownTree(join(root, entry), uid, gid);
    }
  } else if (stat.isFile()) {
    chmodSync(root, 0o644);
  }
  lchownSync(root, uid, gid);
}

/** Carries a registry setup failure past the lifecycle failure wrapping. */
class RegistrySetupFailure extends Error {
  constructor(readonly reason: unknown) {
    super('registry setup failed');
  }
}

async function prepareBuildContainer(
  buildContainer: string,
  buildpack: BuildpackRuntime,
  params: LifecycleRegistryBuildParams,
  client: BuildahClient
): Promise<void> {
  const start = Date.now();
  step(
    `Preparing ${buildpack.runtime} ${params.image.version} stock image and Vercel buildpacks`
  );
  const usage = await BuildahImageUsage.begin();
  await client.run([
    'from',
    '--pull=always',
    '--platform',
    TARGET_PLATFORM,
    '--name',
    buildContainer,
    params.image.buildImage,
  ]);
  await usage?.record(async () => [
    await inspectBaseImageId(buildContainer, client),
  ]);
  await client.run([
    'run',
    '--network',
    'host',
    buildContainer,
    '--',
    'sh',
    '-c',
    `groupadd -g ${BUILD_GROUP_ID} cnb && useradd -m -u ${BUILD_USER_ID} -g ${BUILD_GROUP_ID} cnb && mkdir -p /layers /platform /workspace && chown -R ${BUILD_USER} /layers /platform /workspace /home/cnb`,
  ]);
  await client.run([
    'copy',
    '--chown',
    BUILD_USER,
    buildContainer,
    params.workPath,
    '/workspace',
  ]);
  done(`prepared the ${buildpack.runtime} build image in ${elapsed(start)}`);
}

async function fetchDistributionTimed(
  buildpack: BuildpackRuntime,
  cnbDir: string
): Promise<void> {
  const start = Date.now();
  step('Fetching the CNB lifecycle and buildpacks...');
  await fetchDistribution(buildpack, cnbDir);
  done(`fetched the CNB lifecycle and buildpacks in ${elapsed(start)}`);
}

interface SavedCacheCopy {
  scratch?: string;
  cacheDir?: string;
  imageId?: string;
  restored: BuildpackCacheRestore;
  durationMs: number;
}

/** Cache setup failures must not fail the build. */
async function copySavedCache(
  dir: string,
  buildContainer: string,
  containerReady: Promise<void>,
  client: BuildahClient
): Promise<SavedCacheCopy> {
  const start = Date.now();
  step('Restoring the buildpack cache');
  let scratch: string | undefined;
  try {
    scratch = mkdtempSync(join(cacheScratchParent(), 'vercel-cnb-cache-'));
    chmodSync(scratch, 0o755);
    const cacheDir = join(scratch, 'cache');
    mkdirSync(cacheDir, { mode: 0o755 });
    const imageId = containerReady.then(() =>
      inspectBaseImageId(buildContainer, client)
    );
    const restored = await restoreBuildpackCache(dir, imageId, cacheDir);
    const baseImageId = await imageId;
    debug(`buildpack cache restore took ${Date.now() - start}ms`);
    const chownStart = Date.now();
    chownTree(cacheDir, BUILD_USER_ID, BUILD_GROUP_ID);
    debug(`buildpack cache chown took ${Date.now() - chownStart}ms`);
    return {
      scratch,
      cacheDir,
      imageId: baseImageId,
      restored,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      scratch,
      restored: {
        status: 'miss',
        reason: `setup_failed:${(error as Error).message.split('\n')[0]}`,
      },
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Build and publish a buildpack service with buildah — the Vercel build
 * container path. The docker counterpart for local `vercel build` is
 * `buildAndPushWithLifecycleDocker`.
 */
export async function buildAndPushWithLifecycle(
  buildpack: BuildpackRuntime,
  params: LifecycleRegistryBuildParams,
  client: BuildahClient,
  span?: Span
): Promise<LifecycleRegistryBuildResult> {
  const urls = distributionUrls(buildpack);
  return withSpan(
    span,
    'container.buildpack.lifecycle_registry_build',
    {
      'buildpack.runtime': buildpack.runtime,
      'buildpack.runtime_version': params.image.version,
      'buildpack.build_image': params.image.buildImage,
      'buildpack.run_image': params.image.runImage,
      'buildpack.lifecycle_url': urls.lifecycle,
      'buildpack.archive_url': urls.buildpacks.join(','),
      'buildpack.node_version': params.nodeToolchain?.version,
      'image.ref': params.imageRef,
    },
    async lifecycleSpan => {
      // Randomized so concurrent service builds cannot collide.
      const suffix = `${process.pid}-${randomBytes(4).toString('hex')}`;
      const buildContainer = `vercel-cnb-${buildpack.runtime}-${suffix}`;

      let cnbDir: string | undefined;
      let reportDir: string | undefined;
      let orderDir: string | undefined;
      let platformEnvDir: string | undefined;
      let cacheScratch: string | undefined;
      let containerCleanup: Promise<void> | undefined;

      try {
        reportDir = mkdtempSync(join(tmpdir(), 'vercel-cnb-report-'));
        const reportPath = join(reportDir, 'report.toml');
        // The creator runs as uid 1001 and writes report.toml into this mount.
        chownSync(reportDir, BUILD_USER_ID, BUILD_GROUP_ID);
        chmodSync(reportDir, 0o755);
        cnbDir = mkdtempSync(join(tmpdir(), 'vercel-cnb-'));
        chmodSync(cnbDir, 0o755);
        orderDir = writeOrderDir(buildpack);
        platformEnvDir = writePlatformEnvDir(params.buildEnv, {
          nodeHome: params.nodeToolchain?.home,
          entrypoint: params.entrypoint,
          command: params.command,
        });

        const registrySetup = params.prepareRegistry?.();
        const containerReady = prepareBuildContainer(
          buildContainer,
          buildpack,
          params,
          client
        );
        // Wait for all setup tasks before cleaning up after a failure.
        const [registry, container, distribution, cacheCopy] =
          await Promise.allSettled([
            registrySetup,
            containerReady,
            fetchDistributionTimed(buildpack, cnbDir),
            params.cache
              ? copySavedCache(
                  params.cache.dir,
                  buildContainer,
                  containerReady,
                  client
                )
              : undefined,
          ]);
        const copy =
          cacheCopy.status === 'fulfilled' ? cacheCopy.value : undefined;
        cacheScratch = copy?.scratch;
        if (registry.status === 'rejected') {
          throw new RegistrySetupFailure(registry.reason);
        }
        if (container.status === 'rejected') throw container.reason;
        if (distribution.status === 'rejected') throw distribution.reason;

        const imageId = copy?.imageId;
        const cacheDir = copy?.cacheDir;
        if (copy) {
          done(describeRestore(copy.restored));
          recordRestore(lifecycleSpan, copy.restored, copy.durationMs);
        }

        const platformEnvMount = [
          '--volume',
          `${platformEnvDir}:/platform/env:ro`,
        ];
        const nodeToolchainMount = params.nodeToolchain
          ? [
              '--volume',
              `${params.nodeToolchain.home}:${params.nodeToolchain.home}:ro`,
            ]
          : [];
        const cacheMount = cacheDir
          ? ['--volume', `${cacheDir}:${CACHE_MOUNT_DIR}`]
          : [];
        const lifecycleEnv: NodeJS.ProcessEnv = {
          ...process.env,
          CNB_REGISTRY_AUTH: cnbRegistryAuth(params.credentials),
        };

        step(
          `Building and publishing ${params.imageRef} via Vercel ${buildpack.runtime} buildpacks`
        );
        await client.run(
          [
            'run',
            '--network',
            'host',
            '--user',
            BUILD_USER,
            '--env',
            'HOME=/home/cnb',
            '--env',
            `CNB_USER_ID=${BUILD_USER_ID}`,
            '--env',
            `CNB_GROUP_ID=${BUILD_GROUP_ID}`,
            '--env',
            `CNB_PLATFORM_API=${CNB_PLATFORM_API}`,
            '--env',
            'CNB_REGISTRY_AUTH',
            '--volume',
            `${cnbDir}:/cnb:ro`,
            '--volume',
            `${reportDir}:/platform-output`,
            '--volume',
            `${orderDir}:${ORDER_MOUNT_DIR}:ro`,
            ...nodeToolchainMount,
            ...platformEnvMount,
            ...cacheMount,
            buildContainer,
            '--',
            '/cnb/lifecycle/creator',
            ...creatorArgs(params.image, params.imageRef, {
              cacheDir: cacheDir ? CACHE_MOUNT_DIR : undefined,
              debug: DEBUG,
              parallelExport: true,
            }),
          ],
          { env: lifecycleEnv }
        );
        // The report and the cache are host directories, so the container is
        // done once the creator exits.
        containerCleanup = cleanUpBuildContainer(buildContainer);

        const digest = readReportDigest(readFileSync(reportPath, 'utf8'));
        if (!digest) {
          throw new Error(
            `${buildpack.runtime} buildpack lifecycle did not report a digest.`
          );
        }

        done(`built and published ${params.imageRef}@${digest}`);
        lifecycleSpan?.setAttributes({ 'image.digest': digest });

        if (params.cache && imageId && cacheDir) {
          const saveStart = Date.now();
          const save = await saveBuildpackCache(
            params.cache.dir,
            imageId,
            cacheDir
          );
          done(`${describeSave(save)} in ${elapsed(saveStart)}`);
          recordSave(lifecycleSpan, save, Date.now() - saveStart);
        }

        return {
          imageRef: params.imageRef,
          digest,
          buildImage: params.image.buildImage,
          runImage: params.image.runImage,
          runtimeVersion: params.image.version,
        };
      } catch (error) {
        if (error instanceof RegistrySetupFailure) throw error.reason;
        throw lifecycleFailure(error, {
          buildpack,
          via: 'lifecycle/creator',
          buildImage: params.image.buildImage,
          workPath: params.workPath,
          span: lifecycleSpan,
        });
      } finally {
        containerCleanup ??= cleanUpBuildContainer(buildContainer);
        for (const dir of [
          cnbDir,
          reportDir,
          orderDir,
          platformEnvDir,
          cacheScratch,
        ]) {
          if (dir) {
            try {
              rmSync(dir, { recursive: true, force: true });
            } catch {
              debug(`Could not remove Buildah build scratch directory ${dir}.`);
            }
          }
        }
        await containerCleanup;
      }
    }
  );
}
