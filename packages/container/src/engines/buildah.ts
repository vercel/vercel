import type { Span } from '@vercel/build-utils';
import { resolveBuildConcurrency } from '@vercel/build-utils';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { link, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBuildahStoreStateDirectory } from '../buildah-store-cache/state';
import {
  BuildahImageUsage,
  imageIdsFromBuildOutput,
} from '../buildah-store-cache/usage';
import type { BuildahClient } from '../clients/buildah';
import { selectStorageDriver } from '../storage-driver';
import { formatVcrAuthError } from '../oidc';
import { resolvePushedImageDigest } from '../registry';
import {
  DEBUG,
  debug,
  info,
  isBuildContainer,
  readString,
  toTag,
} from '../util';
import type {
  BuildPushParams,
  ContainerEngine,
  RegistryCredentials,
} from './types';
import { DIGEST_RE, TARGET_PLATFORM, buildArgFlags } from './types';

// The store cache carries images between deployments, and removed tags still
// accumulate in an image's name history, so builds share one local tag.
function localImageRef(params: BuildPushParams): string {
  const { imageRef } = params;
  if (!params.useBuildahStoreCache) {
    return imageRef;
  }
  return `${imageRef.slice(0, imageRef.lastIndexOf(':'))}:vercel-buildah-store`;
}

function pullFlags(params: BuildPushParams): string[] {
  if (params.baseImageIsLocal) {
    return ['--pull=never'];
  }
  return params.useBuildahStoreCache ? ['--pull=always'] : [];
}

/**
 * Concurrent builds of the same Dockerfile step create images that differ only
 * in timestamps, and Buildah later reuses only the newest. One epoch per
 * deployment keeps them identical. Buildah already applies a project's own
 * `SOURCE_DATE_EPOCH`.
 */
export async function deploymentSourceDateEpoch(): Promise<string | undefined> {
  // `vercel build` only runs service builds concurrently above 1.
  if (resolveBuildConcurrency() <= 1) {
    return undefined;
  }
  if (readString(process.env.SOURCE_DATE_EPOCH?.trim()) !== undefined) {
    return undefined;
  }
  try {
    const path = join(
      await createBuildahStoreStateDirectory(),
      'source-date-epoch'
    );
    const candidate = `${path}.${randomUUID()}`;
    await writeFile(candidate, `${Math.floor(Date.now() / 1000)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    try {
      // The first service build to link its candidate decides for the deployment.
      await link(candidate, path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    } finally {
      await rm(candidate, { force: true });
    }
    const epoch = (await readFile(path, 'utf8')).trim();
    if (!/^[0-9]+$/.test(epoch)) {
      throw new Error(`invalid value ${JSON.stringify(epoch)}`);
    }
    return epoch;
  } catch (error) {
    debug(
      `could not share a Buildah source date epoch: ${(error as Error).message}`
    );
    return undefined;
  }
}

export function createBuildahEngine(client: BuildahClient): ContainerEngine {
  return {
    name: 'buildah',

    async ensureReady(span?: Span): Promise<void> {
      try {
        const storageDriver = await selectStorageDriver();
        const version = await client.version();
        span?.setAttributes({
          'buildah.version': version.split('\n')[0],
          'buildah.storage_driver': storageDriver ?? 'storage.conf',
        });
      } catch (err) {
        const message = (err as Error).message;
        if (/Command not found/i.test(message)) {
          throw new Error(
            isBuildContainer()
              ? 'The `buildah` CLI is not available in this build container. ' +
                  'Install buildah (via SPAL) in the build image.'
              : 'Buildah was not found on your PATH. Install buildah or run the build ' +
                  'on Vercel where the build container provides it.'
          );
        }
        throw err;
      }
    },

    async logDiagnostics(span?: Span): Promise<void> {
      try {
        const storageDriver = await selectStorageDriver();
        const version = await client.version();

        info(
          `buildah: ${version.split('\n')[0] ?? version} ` +
            `(storage-driver=${storageDriver ?? 'storage.conf'})`
        );

        span?.setAttributes({
          'container.engine': 'buildah',
          'buildah.version': toTag(version.split('\n')[0]),
          'buildah.storage_driver': toTag(storageDriver ?? 'storage.conf'),
        });
      } catch (err) {
        debug(`buildah diagnostics unavailable: ${(err as Error).message}`);
      }
    },

    async withRuntime<T>(
      _span: Span | undefined,
      fn: () => Promise<T>
    ): Promise<T> {
      return fn();
    },

    async build(params: BuildPushParams): Promise<string> {
      // Report whether the Buildah store already holds images from earlier builds.
      try {
        const { stdout } = await client.run(['images', '--quiet'], {
          quiet: true,
        });
        const imageCount = stdout.trim() ? stdout.trim().split('\n').length : 0;
        info(
          imageCount > 0
            ? `Buildah store: warm (${imageCount} image(s) present before build)`
            : 'Buildah store: cold (no images present before build)'
        );
      } catch (err) {
        debug(`could not read store warmth: ${(err as Error).message}`);
      }

      const sourceDateEpoch = await deploymentSourceDateEpoch();
      if (sourceDateEpoch) {
        info(
          `Buildah source date epoch: ${sourceDateEpoch} (shared by this deployment's concurrent service builds)`
        );
      }
      const usage = await BuildahImageUsage.begin();
      const { stdout, stderr } = await client.run([
        'build',
        '--platform',
        TARGET_PLATFORM,
        // Commit and cache a layer per Dockerfile instruction so unchanged steps
        // (base image, dependency installs, etc.) can be reused on later builds
        // when the image store is warm. Without this buildah squashes the build
        // and no per-step caching happens.
        '--layers',
        // With --layers, Buildah leaves the working container of a FROM-only
        // stage behind, which stops the store cache from being saved.
        '--force-rm',
        ...(sourceDateEpoch ? ['--source-date-epoch', sourceDateEpoch] : []),
        ...pullFlags(params),
        // Use the host network namespace for RUN steps. The build runs inside a
        // restricted Hive cell that cannot program iptables, so buildah's default
        // rootless networking (netavark) fails with
        // "netavark: iptables ... Could not fetch rule set generation id".
        // Host networking skips per-container network setup and reuses the cell's
        // existing egress.
        '--network',
        'host',
        ...buildArgFlags(params),
        '-t',
        localImageRef(params),
        '-f',
        params.dockerfilePath,
        params.contextDir,
      ]);
      await usage?.record(() =>
        imageIdsFromBuildOutput(`${stdout}\n${stderr}`)
      );
      return localImageRef(params);
    },

    async login(params: RegistryCredentials): Promise<void> {
      try {
        await client.run(
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

    async verifyStorage(span?: Span): Promise<void> {
      // Fail loudly (in the build container) if buildah didn't come up on the
      // native overlay driver / mounted volume. No-op locally.
      await client.verifyStorage(message => {
        info(message);
        const info0 = message.split('\n')[0];
        span?.setAttributes({ 'buildah.storage.verify': info0 });
      });
    },

    async reportStorage(span?: Span): Promise<void> {
      if (!DEBUG) {
        return;
      }
      try {
        const storeInfo = await client.info();
        if (!storeInfo) {
          debug('buildah info: no `store` field in output');
          return;
        }
        info(
          `buildah storage: graphRoot=${storeInfo.graphRoot} ` +
            `runRoot=${storeInfo.runRoot} driver=${storeInfo.driver} ` +
            `backingFs=${storeInfo.backingFs || '?'}`
        );
        span?.setAttributes({
          'buildah.storage.graph_root': storeInfo.graphRoot,
          'buildah.storage.run_root': storeInfo.runRoot,
          'buildah.storage.driver': storeInfo.driver,
          'buildah.storage.backing_fs': storeInfo.backingFs,
        });
      } catch (err) {
        debug(`buildah storage report unavailable: ${(err as Error).message}`);
      }
    },

    async push(params: BuildPushParams): Promise<string> {
      const digestDir = mkdtempSync(join(tmpdir(), 'vercel-container-digest-'));
      const digestFile = join(digestDir, 'digest');
      // Push with zstd compression and OCI media types. VCR supports zstd and it
      // makes the server-side VHS conversion faster, especially for larger
      // images. `--force-compression` re-compresses already-compressed (e.g.
      // gzip) base-image layers to zstd too, so every layer is zstd (equivalent
      // to BuildKit's `force-compression=true`). Opt out with
      // VERCEL_VCR_DISABLE_ZSTD=1.
      const zstdEnabled = !readString(process.env.VERCEL_VCR_DISABLE_ZSTD);
      const zstdArgs = zstdEnabled
        ? [
            '--compression-format',
            'zstd',
            '--compression-level',
            '3',
            '--force-compression',
            '--format',
            'oci',
          ]
        : [];
      info(
        `pushing ${params.imageRef} ` +
          (zstdEnabled
            ? 'with zstd compression (level=3, force, oci)'
            : 'with default compression (zstd disabled)')
      );
      const pushStart = Date.now();
      let digest: string;
      try {
        await client.run([
          'push',
          ...zstdArgs,
          '--digestfile',
          digestFile,
          localImageRef(params),
          ...(params.useBuildahStoreCache
            ? [`docker://${params.imageRef}`]
            : []),
        ]);
        digest = readDigestFile(digestFile);
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
      } finally {
        rmSync(digestDir, { recursive: true, force: true });
      }
      debug(`push completed in ${Date.now() - pushStart}ms`);

      if (DIGEST_RE.test(digest)) {
        debug(`pushed digest ${digest}`);
        return digest;
      }

      debug(
        `--digestfile did not contain a digest (${JSON.stringify(digest)}) — resolving registry manifest`
      );
      return resolvePushedImageDigest(params);
    },
  };
}

function readDigestFile(path: string): string {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch (err) {
    debug(`could not read --digestfile: ${(err as Error).message}`);
    return '';
  }
}
