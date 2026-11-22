import type { BuildOptions, BuildResultV2, Span } from '@vercel/build-utils';
import {
  getDaemonImageRepository,
  getLambdaOptionsFromFunction,
  getReportedServiceType,
} from '@vercel/build-utils';
import {
  buildSchedulesCommandImage,
  SCHEDULES_COMMAND_ENV,
  type SchedulesCommand,
} from './schedules-command';
import { generateProjectManifest } from './diagnostics';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  selectContainerEngine,
  VCR_REGISTRY,
  TARGET_PLATFORM,
} from './engines';
import type { BuildPushParams, ContainerEngine } from './engines/types';
import { BuildahClient } from './clients/buildah';
import { buildAndPushBuildpack } from './buildpacks/build';
import { BUILDPACK_FAILED_EXIT_CODE } from './buildpacks/lifecycle/lifecycle';
import type { ImageSource } from './image-source';
import { resolveImageSource } from './image-source';
import { BuildahStoreCache } from './buildah-store-cache/cache';
import { buildahStoreCacheEnabled } from './buildah-store-cache/config';
import { sharedBuildahStoreLock } from './buildah-store-cache/lock';
import { ensureRepository, resolveRegistryTarget } from './registry';
import {
  debug,
  devImageTag,
  done,
  elapsed,
  existingRegistryAuthFile,
  findDockerfile,
  info,
  normalizeCommand,
  readString,
  type RunError,
  shortDigest,
  step,
  toTag,
  withSpan,
} from './util';

export const version = 2;

/**
 * Output path for the container function.
 *
 * Deliberately not `index`: the filesystem handler resolves `/` to an `index`
 * output, so a rewrite landing on `/` would dispatch there before the catch-all
 * can copy the resolved destination into the runtime request path.
 */
export const CONTAINER_OUTPUT_PATH = 'container';

export { startDevServer } from './dev';
export { prepareCache } from './prepare-cache';
export { diagnostics } from './diagnostics';

function resolveFunctionSourceFile(options: BuildOptions): string {
  const entrypoint = readString(options.entrypoint) ?? '';
  if (entrypoint === '<detect>') {
    return findDockerfile(options.workPath) ?? entrypoint;
  }
  return entrypoint;
}

function sanitizeRepository(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9-_./]/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^[-/.]+)|([-/.]+$)/g, '');
  return sanitized || 'service';
}

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

async function authenticateRegistry(
  engine: ContainerEngine,
  buildParams: BuildPushParams,
  span?: Span
): Promise<void> {
  const forceLogin = readString(process.env.VERCEL_VCR_FORCE_LOGIN) === '1';
  const authFile = forceLogin ? undefined : existingRegistryAuthFile();
  if (authFile) {
    debug(`registry auth file present: ${authFile}`);
    step(`Using registry credentials from ${authFile}`);
    span?.setAttributes({
      'container.registry': VCR_REGISTRY,
      'registry.username': buildParams.username,
      'registry.auth_file': authFile,
      'registry.login_skipped': toTag(true),
    });
    done('authenticated via provisioned credentials');
    return;
  }

  step(`Authenticating to ${VCR_REGISTRY} as ${buildParams.username}`);
  await withSpan(
    span,
    'container.registry_login',
    {
      'container.registry': VCR_REGISTRY,
      'registry.username': buildParams.username,
    },
    () => engine.login(buildParams)
  );
  done('authenticated');
}

async function buildAndPushImage(params: {
  contextDir: string;
  dockerfilePath: string;
  repository: string;
  tag: string;
  buildArgs?: Record<string, string>;
  buildahClient: BuildahClient;
  parentSpan?: Span;
  schedulesCommand?: SchedulesCommand;
}): Promise<string> {
  const {
    contextDir,
    dockerfilePath,
    repository,
    tag,
    buildArgs,
    buildahClient,
    parentSpan,
  } = params;
  const engine = selectContainerEngine(buildahClient);

  return withSpan(
    parentSpan,
    'container.build_and_push',
    {
      'container.engine': engine.name,
      'container.registry': VCR_REGISTRY,
      'container.repository': repository,
    },
    async buildSpan => {
      const target = await resolveRegistryTarget({
        repository,
        tag,
        span: buildSpan,
      });
      const { token, claims, username, fullRepository, imageRef } = target;

      buildSpan?.setAttributes({
        'container.repository': fullRepository,
        'image.tag': tag,
        'image.ref': imageRef,
        'registry.username': username,
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
          'container.toolchain_diagnostics',
          { 'container.engine': engine.name },
          s => engine.logDiagnostics(s)
        );

        // Verify storage is configured as intended (native overlay on the
        // mounted cell volume) before doing any work. Fails the build fast if
        // misconfigured rather than silently running on slow vfs.
        await withSpan(
          buildSpan,
          'container.verify_storage',
          { 'container.engine': engine.name },
          s => engine.verifyStorage?.(s) ?? Promise.resolve()
        );

        const buildParams: BuildPushParams = {
          contextDir,
          dockerfilePath,
          imageRef,
          registry: VCR_REGISTRY,
          username,
          token,
          repository,
          buildArgs,
          useBuildahStoreCache: buildahStoreCacheEnabled(),
          span: buildSpan,
        };

        await authenticateRegistry(engine, buildParams, buildSpan);

        await withSpan(
          buildSpan,
          'container.ensure_repository',
          { 'container.repository': repository },
          s => ensureRepository(repository, token, claims, s)
        );

        info(`Building image ${imageRef} (${engine.name})`);
        debug(`dockerfile: ${dockerfilePath}`);
        debug(`context:    ${contextDir}`);
        debug(`platform:   ${TARGET_PLATFORM}`);
        debug(
          `build args:  ${
            buildArgs ? Object.keys(buildArgs).length : 0
          } (from project build env)`
        );

        const buildStart = Date.now();
        step(`${engine.name} build (${TARGET_PLATFORM})`);
        await withSpan(
          buildSpan,
          'container.image_build',
          { 'image.ref': imageRef, 'image.platform': TARGET_PLATFORM },
          async () => {
            if (params.schedulesCommand) {
              await buildSchedulesCommandImage(engine, buildParams);
            } else {
              await engine.build(buildParams);
            }
          }
        );
        done(`built in ${elapsed(buildStart)}`);

        const pushStart = Date.now();
        step(`Pushing ${imageRef}`);
        const digest = await withSpan(
          buildSpan,
          'container.push',
          { 'image.ref': imageRef },
          () => engine.push(buildParams)
        );
        done(`pushed ${shortDigest(digest)} in ${elapsed(pushStart)}`);

        // Post-build confirmation of the effective image store (debug-only).
        await withSpan(
          buildSpan,
          'container.report_storage',
          { 'container.engine': engine.name },
          s => engine.reportStorage?.(s) ?? Promise.resolve()
        );

        const resolvedRef = `${VCR_REGISTRY}/${fullRepository}@${digest}`;
        buildSpan?.setAttributes({
          'image.digest': digest,
          'image.resolved_ref': resolvedRef,
        });

        info(`Image reference ${resolvedRef}`);
        debug(
          `container build_and_push total: ${elapsed(buildStart)} ` +
            `(build + push + storage report)`
        );
        return resolvedRef;
      });
    }
  );
}

async function resolveImageHandler(
  options: BuildOptions,
  source: ImageSource,
  buildahClient: BuildahClient,
  span?: Span,
  schedulesCommand?: SchedulesCommand
): Promise<string> {
  const { config, meta } = options;
  const { daemon } = config;

  span?.setAttributes({
    'container.has_dockerfile': toTag(source.kind === 'dockerfile'),
    'container.is_dev': toTag(Boolean(meta?.isDev)),
  });

  if (source.kind === 'prebuilt') {
    span?.setAttributes({ 'container.mode': 'prebuilt' });
    info(`Using prebuilt image ${source.imageRef}`);
    return source.imageRef;
  }

  if (source.kind === 'buildpack') {
    const { buildpack } = source;
    if (meta?.isDev) {
      const tag = devImageTag(options.service?.name ?? 'service');
      span?.setAttributes({
        'container.mode': 'buildpack-dev',
        'buildpack.runtime': buildpack.runtime,
        'image.tag': tag,
      });
      return tag;
    }

    const repository = daemon
      ? getDaemonImageRepository(daemon.name)
      : sanitizeRepository(options.service?.name ?? buildpack.runtime);
    const tag = resolveImageTag();
    span?.setAttributes({
      'container.mode': 'buildpack-build-and-push',
      'buildpack.runtime': buildpack.runtime,
      'container.repository': repository,
      'image.tag': tag,
    });
    try {
      return await buildAndPushBuildpack({
        buildpack,
        files: options.files,
        workPath: options.workPath,
        repoRootPath: options.repoRootPath,
        service: options.service,
        repository,
        tag,
        config,
        meta,
        buildEnv: buildArgsFromEnv(meta?.buildEnv),
        buildahClient,
        parentSpan: span,
      });
    } catch (error) {
      if (
        daemon &&
        (error as RunError).exitCode === BUILDPACK_FAILED_EXIT_CODE
      ) {
        throw new Error(
          `Failed to build daemon "${daemon.name}" (root "${daemon.root}") with the ${buildpack.runtime} buildpack. Its error is above.`
        );
      }
      throw error;
    }
  }

  const { dockerfileRel, dockerfilePath } = source;

  if (meta?.isDev) {
    // In dev the image is built and run locally from the Dockerfile by
    // `startDevServer` (see ./dev.ts `resolveDevImage`), which never pushes to
    // a registry. The `build()` path must not push either, so we don't build
    // here — we only return a stable local tag for the build output. The
    // resolved entrypoint is always a Dockerfile/Containerfile (containers have
    // no prebuilt-image input), so there is nothing to error on.
    const serviceName = options.service?.name;
    const tag = devImageTag(
      serviceName ?? path.basename(dockerfileRel).split('.')[0]
    );
    span?.setAttributes({ 'container.mode': 'dev', 'image.tag': tag });
    return tag;
  }

  if (!existsSync(dockerfilePath)) {
    throw new Error(
      `Dockerfile not found at "${dockerfilePath}" for container service.`
    );
  }

  // Named services derive the registry repository from the service name. A
  // root (non-service) container deploy has no service name, so fall back to
  // the Dockerfile's base name (e.g. `Dockerfile.vercel` -> `dockerfile`,
  // `Containerfile.vercel` -> `containerfile`). The repository is already
  // namespaced by owner/project from the OIDC claims, so this leaf only needs
  // to be stable per project. Daemons get their own repositories, so a daemon
  // and a service may share a name.
  const repository = daemon
    ? getDaemonImageRepository(daemon.name)
    : sanitizeRepository(
        options.service?.name ?? path.basename(dockerfileRel).split('.')[0]
      );
  const tag = resolveImageTag();
  const contextDir = schedulesCommand
    ? path.join(options.workPath, schedulesCommand.root)
    : path.dirname(dockerfilePath);
  // Command schedules use their root as context, including nested Dockerfiles.
  // A daemon's `dockerfileRel` includes its root; use its entrypoint.
  const contextIsRoot =
    Boolean(schedulesCommand) ||
    path.dirname(path.normalize(daemon ? daemon.entrypoint : dockerfileRel)) ===
      '.';

  // Forward the project's build env to the image build as `--build-arg`s, so
  // Dockerfiles can consume declared `ARG`s during build — matching how other
  // builders run build steps with the build env. Only the project's build env
  // (`meta.buildEnv`) is used, never the build container's own environment.
  const buildArgs = buildArgsFromEnv(meta?.buildEnv);

  span?.setAttributes({
    'container.mode': 'build_and_push',
    'container.repository': repository,
    'container.context_is_root': toTag(contextIsRoot),
    'image.tag': tag,
  });
  return buildAndPushImage({
    contextDir,
    dockerfilePath,
    repository,
    tag,
    buildArgs,
    buildahClient,
    parentSpan: span,
    schedulesCommand,
  });
}

/** Coerce a build env map to string-only `--build-arg` values. */
function buildArgsFromEnv(
  env: Record<string, string | undefined> | undefined
): Record<string, string> | undefined {
  if (!env) {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export async function build(options: BuildOptions): Promise<BuildResultV2> {
  const source = resolveImageSource(options, 'build');
  const schedulesCommand = options.config.schedulesCommand as
    | SchedulesCommand
    | undefined;
  const { daemon } = options.config;
  const buildahClient = new BuildahClient(sharedBuildahStoreLock);
  // Opening an empty store would make later services skip the restore.
  if (
    !options.meta?.isDev &&
    selectContainerEngine(buildahClient).name === 'buildah'
  ) {
    await BuildahStoreCache.forProject(options, buildahClient).beforeBuild({
      buildsWithBuildah: source.kind !== 'prebuilt',
      span: options.span,
    });
  }
  const image = await withSpan(
    options.span,
    'container.resolve_image',
    { 'service.name': options.service?.name },
    span =>
      resolveImageHandler(
        options,
        source,
        buildahClient,
        span,
        schedulesCommand
      )
  );

  if (daemon) {
    return {
      output: {},
      daemons: {
        [daemon.name]: {
          runtime: 'container',
          image,
          // Checked by vercel.json validation: a daemon sets one of them.
          instances: (daemon.instances ?? daemon.replicas)!,
          // A command replaces the image's entrypoint, which for a buildpack
          // image is the launcher; the buildpack bakes the command in instead.
          ...(daemon.command &&
            source.kind !== 'buildpack' && { command: daemon.command }),
          ...(daemon.resources && { resources: daemon.resources }),
          ...(daemon.terminationGracePeriodSeconds !== undefined && {
            terminationGracePeriodSeconds: daemon.terminationGracePeriodSeconds,
          }),
          ...(daemon.livenessProbe && { livenessProbe: daemon.livenessProbe }),
          ...(daemon.bindings?.length && {
            bindings: daemon.bindings.map(({ type, service, format, env }) => ({
              type,
              service,
              format,
              env,
            })),
          }),
        },
      },
    };
  }

  const lambdaOptions = await getLambdaOptionsFromFunction({
    sourceFile: resolveFunctionSourceFile(options),
    config: options.config,
    isScheduleEntrypoint: schedulesCommand !== undefined,
  });

  const command =
    source.kind === 'buildpack' || schedulesCommand
      ? undefined
      : normalizeCommand(options.config.command);

  await generateProjectManifest({
    workPath: options.workPath,
    framework: options.diagnosticsValues?.framework,
    serviceType: options.service
      ? getReportedServiceType(options.service)
      : undefined,
  });

  // Do a normal build: a catch-all route forwards every request to the
  // function. Without it there is no `/` route, so for a service the top-level
  // service rewrite resolves to nothing (vercel/vercel#16648), and for a root
  // (non-service) container deploy nothing reaches the function at all. The
  // only service-specific concern, nesting the output under
  // `services/<name>/`, is handled by the CLI, not here.
  const routes = [
    { handle: 'filesystem' as const },
    // This route matches the resolved destination after rewrites. Copy that
    // path into the runtime request before dispatching the container so its
    // application routing observes the rewrite.
    {
      src: '/(.*)',
      dest: `/${CONTAINER_OUTPUT_PATH}`,
      transforms: [
        {
          type: 'request.path' as const,
          op: 'set' as const,
          args: '/$1',
        },
      ],
    },
  ];

  return {
    routes: schedulesCommand ? [] : routes,
    output: {
      [CONTAINER_OUTPUT_PATH]: {
        type: 'Lambda',
        files: {},
        // For `runtime: 'container'` the OCI image reference is carried in
        // `handler`; the platform surfaces it as the container image downstream
        // (vercel/api#76729).
        handler: image,
        runtime: 'container',
        environment: schedulesCommand
          ? {
              [SCHEDULES_COMMAND_ENV]: JSON.stringify(schedulesCommand.command),
            }
          : {},
        ...(command ? { command } : {}),
        ...lambdaOptions,
      } as any,
    },
  };
}
