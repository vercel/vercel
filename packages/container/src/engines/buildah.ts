import type { Span } from '@vercel/build-utils';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertBuildContainerStorage,
  buildahStorageArgs,
  readBuildahStoreInfo,
  selectStorageDriver,
} from '../storage-driver';
import { formatVcrAuthError } from '../oidc';
import {
  DEBUG,
  debug,
  info,
  isBuildContainer,
  readString,
  run,
  toTag,
} from '../util';
import type { BuildPushParams, ContainerEngine } from './types';
import { TARGET_PLATFORM, buildArgFlags } from './types';

async function runBuildah(
  args: string[],
  opts: { input?: string; quiet?: boolean } = {}
) {
  const storageArgs = await buildahStorageArgs();
  const fullArgs = [...storageArgs, ...args];
  // Log the exact buildah invocation (flags included) so failures/behavior are
  // diagnosable from build logs. `--password-stdin` reads the secret from
  // stdin, so nothing sensitive is on the command line.
  debug(`exec: buildah ${fullArgs.join(' ')}`);
  return run('buildah', fullArgs, opts);
}

/**
 * Parse buildah `build --layers` output and log how many Dockerfile steps were
 * served from cache vs. freshly built. With `--layers`, buildah prints a
 * `STEP i/n: ...` line per instruction and `--> Using cache <id>` when a layer
 * is reused. This makes layer-cache effectiveness visible in build logs.
 */
function logLayerCacheSummary(output: string): void {
  const steps = (output.match(/^STEP\s+\d+\/\d+:/gm) || []).length;
  const cached = (output.match(/-->\s+Using cache\b/gi) || []).length;
  if (steps === 0) {
    return;
  }
  const built = Math.max(steps - cached, 0);
  info(`layer cache: ${cached}/${steps} steps reused, ${built} rebuilt`);
}

export const buildahEngine: ContainerEngine = {
  name: 'buildah',

  async ensureReady(span?: Span): Promise<void> {
    try {
      const storageDriver = await selectStorageDriver();
      const { stdout } = await runBuildah(['--version'], { quiet: true });
      span?.setAttributes({
        'buildah.version': stdout.trim().split('\n')[0],
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
      const version = (
        await runBuildah(['--version'], { quiet: true })
      ).stdout.trim();

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

  async build(params: BuildPushParams): Promise<void> {
    // Report whether the layer store started warm (restored by prepareCache) or
    // cold, so cache effectiveness is visible up front.
    try {
      const { stdout } = await runBuildah(['images', '--quiet'], {
        quiet: true,
      });
      const imageCount = stdout.trim() ? stdout.trim().split('\n').length : 0;
      info(
        imageCount > 0
          ? `layer store: warm (${imageCount} image(s) present before build)`
          : 'layer store: cold (no cached images; first build or cache miss)'
      );
    } catch (err) {
      debug(`could not read store warmth: ${(err as Error).message}`);
    }

    const { stdout, stderr } = await runBuildah([
      'build',
      '--platform',
      TARGET_PLATFORM,
      // Commit and cache a layer per Dockerfile instruction so unchanged steps
      // (base image, dependency installs, etc.) can be reused on later builds
      // when the image store is warm. Without this buildah squashes the build
      // and no per-step caching happens.
      '--layers',
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
      params.imageRef,
      '-f',
      params.dockerfilePath,
      params.contextDir,
    ]);
    logLayerCacheSummary(`${stdout}\n${stderr}`);
  },

  async login(params: BuildPushParams): Promise<void> {
    try {
      await runBuildah(
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
    await assertBuildContainerStorage(message => {
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
      const storeInfo = await readBuildahStoreInfo();
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

  async push(params: BuildPushParams): Promise<string | undefined> {
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
    try {
      await runBuildah([
        'push',
        ...zstdArgs,
        '--digestfile',
        digestFile,
        params.imageRef,
      ]);
      const digest = readFileSync(digestFile, 'utf8').trim();
      const resolved =
        digest.match(/sha256:[a-f0-9]{64}/)?.[0] ?? (digest || undefined);
      debug(
        `push completed in ${Date.now() - pushStart}ms` +
          (resolved ? ` (digest ${resolved})` : '')
      );
      return resolved;
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
  },
};
