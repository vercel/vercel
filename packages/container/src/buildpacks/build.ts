import type { BuildOptions, Span } from '@vercel/build-utils';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BuildahClient } from '../clients/buildah';
import { selectContainerEngine, VCR_REGISTRY } from '../engines';
import type { RegistryCredentials } from '../engines/types';
import { ensureRepository, resolveRegistryTarget } from '../registry';
import { debug, done, info, readString, step, warn, withSpan } from '../util';
import { buildpackCacheDir } from './cache';
import type {
  LifecycleRegistryBuildParams,
  LifecycleRegistryBuildResult,
} from './lifecycle/lifecycle';
import { stageWorkspace } from './lifecycle/lifecycle';
import { buildAndPushWithLifecycle } from './lifecycle/buildah';
import { buildAndPushWithLifecycleDocker } from './lifecycle/docker';
import type { NodeToolchain } from './node-toolchain';
import {
  resolveLocalNodeToolchain,
  resolveNodeToolchain,
} from './node-toolchain';
import { getPrereleaseUrl, withPrereleaseBuildpack } from './distribution';
import type { BuildpackRuntime } from './registry';
import { hasProjectMarkers } from './registry';

type BuildpackBuildParams = Pick<
  BuildOptions,
  'files' | 'workPath' | 'repoRootPath' | 'service' | 'config' | 'meta'
> & {
  buildpack: BuildpackRuntime;
  repository: string;
  tag: string;
  buildEnv?: Record<string, string>;
  parentSpan?: Span;
  buildahClient: BuildahClient;
};

/**
 * The program the buildpack builds, passed as `VERCEL_ENTRYPOINT`: the
 * configured entrypoint, which a daemon always has, then a zero-config app's
 * `VERCEL_ENTRYPOINT` environment variable, then the runtime's default.
 */
function selectEntrypoint(
  params: BuildpackBuildParams,
  sourceDir: string
): string | undefined {
  const configured = readString(params.config.buildpackEntrypoint);
  if (configured !== undefined) return configured;
  const zeroConfig = params.service === undefined;
  const fromEnv = zeroConfig
    ? readString(params.buildEnv?.VERCEL_ENTRYPOINT)
    : undefined;
  return (
    fromEnv ??
    params.buildpack.defaultEntrypoint?.({ workPath: sourceDir, zeroConfig })
  );
}

/** Stage the service, run its buildpacks, and return the published image reference. */
export async function buildAndPushBuildpack(
  params: BuildpackBuildParams
): Promise<string> {
  const sourceDir = mkdtempSync(join(tmpdir(), 'vercel-cnb-source-'));
  try {
    step('Staging buildpack source files');
    await stageWorkspace(params, sourceDir);

    // Engine selection never probes for binaries: the build container is
    // buildah, and local `vercel build` is docker-only by design (the buildah
    // runner assumes build-container invariants like running as root).
    const { buildahClient } = params;
    const engine = selectContainerEngine(buildahClient);
    if (!hasProjectMarkers(params.buildpack, sourceDir)) {
      throw new Error(
        `The ${params.buildpack.runtime} buildpack was selected, but no supported project marker was found in the service sources. Add ${params.buildpack.projectMarkers.join(' or ')}, or add a Dockerfile.vercel to control the image build.`
      );
    }
    params.buildpack.validate?.({
      workPath: sourceDir,
      buildEnv: params.buildEnv,
    });
    const entrypoint = selectEntrypoint(params, sourceDir);
    if (entrypoint !== undefined) {
      debug(
        `Passing VERCEL_ENTRYPOINT=${entrypoint} to the ${params.buildpack.runtime} buildpack`
      );
    }
    // Buildpacks build the service themselves and never run a custom build
    // command; say so instead of dropping it silently.
    const buildCommand = readString(params.config.buildCommand);
    if (buildCommand?.trim()) {
      warn(
        `The build command ${JSON.stringify(buildCommand)} is not supported and will be ignored.`
      );
    }
    const prereleaseUrl = getPrereleaseUrl();
    const buildpack = prereleaseUrl
      ? await withPrereleaseBuildpack(params.buildpack, prereleaseUrl)
      : params.buildpack;
    const image = await buildpack.resolveImage(sourceDir);
    // Buildah (the build container) uses the pinned /node<major> installs;
    // docker (local `vercel build`) bakes Node into the derived build image.
    const nodeToolchain: NodeToolchain | undefined =
      engine.name === 'buildah'
        ? await resolveNodeToolchain(sourceDir, params.config, params.meta)
        : await resolveLocalNodeToolchain(
            sourceDir,
            params.config,
            params.meta
          );

    return await withSpan(
      params.parentSpan,
      'container.buildpack.build_and_push',
      {
        'buildpack.runtime': buildpack.runtime,
        'buildpack.runtime_version': image.version,
        'buildpack.node_version': nodeToolchain?.version,
        'buildpack.prerelease_url': prereleaseUrl,
        'container.engine': engine.name,
        'container.repository': params.repository,
      },
      async buildSpan => {
        const target = await resolveRegistryTarget({
          repository: params.repository,
          tag: params.tag,
          span: buildSpan,
        });
        buildSpan?.setAttributes({
          'container.repository': target.fullRepository,
          'image.tag': params.tag,
          'image.ref': target.imageRef,
          'registry.username': target.username,
        });

        // Only the build container persists `.vercel/cache`.
        const cache =
          engine.name === 'buildah'
            ? { dir: buildpackCacheDir(params) }
            : undefined;
        if (cache) debug(`buildpack cache: ${cache.dir}`);
        buildSpan?.setAttributes({
          'buildpack.cache.enabled': String(Boolean(cache)),
        });

        return engine.withRuntime(buildSpan, async () => {
          await withSpan(
            buildSpan,
            'container.ensure_toolchain_ready',
            { 'container.engine': engine.name },
            s => engine.ensureReady(s)
          );
          await withSpan(
            buildSpan,
            'container.verify_storage',
            { 'container.engine': engine.name },
            s => engine.verifyStorage?.(s) ?? Promise.resolve()
          );
          // Validate the credentials up front with the engine; the lifecycle
          // then receives the same ones via CNB_REGISTRY_AUTH to export the image.
          const credentials: RegistryCredentials = {
            registry: VCR_REGISTRY,
            username: target.username,
            token: target.token,
          };
          const prepareRegistry = async (): Promise<void> => {
            step(`Authenticating to ${VCR_REGISTRY} as ${target.username}`);
            await withSpan(
              buildSpan,
              'container.registry_login',
              {
                'container.registry': VCR_REGISTRY,
                'registry.username': target.username,
              },
              () => engine.login(credentials)
            );
            done('authenticated');

            await withSpan(
              buildSpan,
              'container.ensure_repository',
              { 'container.repository': params.repository },
              s =>
                ensureRepository(
                  params.repository,
                  target.token,
                  target.claims,
                  s
                )
            );
          };
          const lifecycleParams: LifecycleRegistryBuildParams = {
            workPath: sourceDir,
            image,
            imageRef: target.imageRef,
            credentials,
            buildEnv: params.buildEnv,
            nodeToolchain,
            cache,
            entrypoint,
            command: params.config.daemon?.command,
          };

          let result: LifecycleRegistryBuildResult;
          if (engine.name === 'buildah') {
            result = await buildAndPushWithLifecycle(
              buildpack,
              { ...lifecycleParams, prepareRegistry },
              buildahClient,
              buildSpan
            );
          } else {
            await prepareRegistry();
            result = await buildAndPushWithLifecycleDocker(
              buildpack,
              lifecycleParams,
              buildSpan
            );
          }
          const resolvedRef = `${VCR_REGISTRY}/${target.fullRepository}@${result.digest}`;
          buildSpan?.setAttributes({
            'image.digest': result.digest,
            'image.resolved_ref': resolvedRef,
          });
          info(`Image reference ${resolvedRef}`);
          return resolvedRef;
        });
      }
    );
  } finally {
    try {
      rmSync(sourceDir, { recursive: true, force: true });
    } catch {
      debug(`Could not remove buildpack source snapshot ${sourceDir}.`);
    }
  }
}
