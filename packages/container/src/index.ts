import type { BuildOptions, BuildResultV2, Span } from '@vercel/build-utils';
import {
  getLambdaOptionsFromFunction,
  getReportedServiceType,
  sanitizeConsumerName,
} from '@vercel/build-utils';
import { generateProjectManifest } from './diagnostics';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  selectContainerEngine,
  VCR_REGISTRY,
  TARGET_PLATFORM,
} from './engines';
import type { BuildPushParams, ContainerEngine } from './engines/types';
import { buildAndPushWithLifecycle } from './buildpacks/lifecycle';
import type { BuildpackDescriptor } from './buildpacks/registry';
import { requestedBuildpack } from './buildpacks/registry';
import { resolveImageSource } from './image-source';
import { resolveOidcTokenForBuild } from './oidc';
import { ensureRepository } from './registry';
import {
  debug,
  debugTokenClaims,
  decodeOidcClaims,
  devImageTag,
  done,
  elapsed,
  existingRegistryAuthFile,
  findDockerfile,
  info,
  normalizeCommand,
  readString,
  shortDigest,
  step,
  tokenFingerprint,
  toTag,
  withSpan,
} from './util';
import type { OidcClaims } from './util';

export const version = 2;

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

interface RegistryTarget {
  token: string;
  claims: OidcClaims;
  username: string;
  fullRepository: string;
  imageRef: string;
}

async function resolveRegistryTarget(params: {
  repository: string;
  tag: string;
  span?: Span;
}): Promise<RegistryTarget> {
  const token = await withSpan(params.span, 'container.mint_oidc', {}, s =>
    resolveOidcTokenForBuild(s)
  );
  const claims = decodeOidcClaims(token);
  debug(`registry token: ${tokenFingerprint(token)}`);
  debugTokenClaims('OIDC token claims', token);

  const username = claims.owner_id;
  if (!username) {
    throw new Error(
      'VERCEL_OIDC_TOKEN is missing the `owner_id` (team id) claim required to ' +
        'authenticate to the container registry.'
    );
  }

  const fullRepository = [claims.owner, claims.project, params.repository].join(
    '/'
  );
  return {
    token,
    claims,
    username,
    fullRepository,
    imageRef: `${VCR_REGISTRY}/${fullRepository}:${params.tag}`,
  };
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
  parentSpan?: Span;
}): Promise<string> {
  const { contextDir, dockerfilePath, repository, tag, buildArgs, parentSpan } =
    params;
  const engine = selectContainerEngine();

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
          () => engine.build(buildParams)
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
        done(
          digest
            ? `pushed ${shortDigest(digest)} in ${elapsed(pushStart)}`
            : `pushed in ${elapsed(pushStart)}`
        );

        // Post-build confirmation of the effective image store (debug-only).
        await withSpan(
          buildSpan,
          'container.report_storage',
          { 'container.engine': engine.name },
          s => engine.reportStorage?.(s) ?? Promise.resolve()
        );

        const resolvedRef = digest
          ? `${VCR_REGISTRY}/${fullRepository}@${digest}`
          : imageRef;
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

async function buildAndPushBuildpack(params: {
  buildpack: BuildpackDescriptor;
  workPath: string;
  repository: string;
  tag: string;
  buildEnv?: Record<string, string>;
  command?: string[];
  commandShell?: boolean;
  parentSpan?: Span;
}): Promise<string> {
  const engine = selectContainerEngine();
  if (engine.name !== 'buildah') {
    throw new Error(
      'Buildpack deployments require the Vercel Buildah build environment. ' +
        'Use `vercel dev` for local buildpack development.'
    );
  }

  return withSpan(
    params.parentSpan,
    'container.buildpack.build_and_push',
    {
      'buildpack.runtime': params.buildpack.runtime,
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
        await withSpan(
          buildSpan,
          'container.ensure_repository',
          { 'container.repository': params.repository },
          s =>
            ensureRepository(params.repository, target.token, target.claims, s)
        );

        const result = await buildAndPushWithLifecycle(
          params.buildpack,
          {
            workPath: params.workPath,
            imageRef: target.imageRef,
            registry: VCR_REGISTRY,
            username: target.username,
            token: target.token,
            buildEnv: params.buildEnv,
            command: params.command,
            commandShell: params.commandShell,
          },
          buildSpan
        );
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
}

async function resolveImageHandler(
  options: BuildOptions,
  span?: Span
): Promise<string> {
  const { config, workPath, meta } = options;

  const source = resolveImageSource(options, 'build');
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

    const repository = sanitizeRepository(
      options.service?.name ?? buildpack.runtime
    );
    const tag = resolveImageTag();
    span?.setAttributes({
      'container.mode': 'buildpack-build-and-push',
      'buildpack.runtime': buildpack.runtime,
      'container.repository': repository,
      'image.tag': tag,
    });
    return buildAndPushBuildpack({
      buildpack,
      workPath,
      repository,
      tag,
      buildEnv: buildArgsFromEnv(meta?.buildEnv),
      command: normalizeCommand(config.command),
      commandShell:
        typeof config.command === 'string' || config.commandShell === true,
      parentSpan: span,
    });
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
  // to be stable per project.
  const serviceName = options.service?.name;
  const repository = sanitizeRepository(
    serviceName ?? path.basename(dockerfileRel).split('.')[0]
  );
  const tag = resolveImageTag();
  const contextDir = path.dirname(dockerfilePath);

  // Forward the project's build env to the image build as `--build-arg`s, so
  // Dockerfiles can consume declared `ARG`s during build — matching how other
  // builders run build steps with the build env. Only the project's build env
  // (`meta.buildEnv`) is used, never the build container's own environment.
  const buildArgs = buildArgsFromEnv(meta?.buildEnv);

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
    buildArgs,
    parentSpan: span,
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
  const image = await withSpan(
    options.span,
    'container.resolve_image',
    { 'service.name': options.service?.name },
    span => resolveImageHandler(options, span)
  );

  const buildpack = requestedBuildpack(options.config);
  let lambdaOptions = await getLambdaOptionsFromFunction({
    sourceFile: resolveFunctionSourceFile(options),
    config: options.config,
  });
  if (
    lambdaOptions.experimentalTriggers === undefined &&
    buildpack?.defaultTriggers?.length
  ) {
    const sourceFile = resolveFunctionSourceFile(options);
    const serviceName = readString(options.config.serviceName);
    const consumer = sanitizeConsumerName(
      serviceName ? `${serviceName}~${sourceFile}` : sourceFile
    );
    lambdaOptions.experimentalTriggers = buildpack.defaultTriggers.map(
      trigger =>
        trigger.type === 'queue/v2beta'
          ? { ...trigger, consumer }
          : { ...trigger }
    );
  }

  const command = normalizeCommand(options.config.command);

  await generateProjectManifest({
    workPath: options.workPath,
    framework: options.config.framework ?? undefined,
    serviceType: options.service
      ? getReportedServiceType(options.service)
      : undefined,
  });

  // Do a normal build: the function lands at the natural `index` path and a
  // catch-all route forwards every request to it. Without it there is no `/`
  // route, so for a service the top-level service rewrite resolves to nothing
  // (vercel/vercel#16648), and for a root (non-service) container deploy
  // nothing reaches the function at all. The filesystem handler resolves `/`
  // to the `index` output. The only service-specific concern — nesting the
  // output under `services/<name>/` — is handled by the CLI, not here.
  const routes = [
    { handle: 'filesystem' as const },
    { src: '/(.*)', dest: '/index' },
  ];

  return {
    routes,
    output: {
      index: {
        type: 'Lambda',
        files: {},
        // For `runtime: 'container'` the OCI image reference is carried in
        // `handler`; the platform surfaces it as the container image downstream
        // (vercel/api#76729).
        handler: image,
        runtime: 'container',
        environment: {},
        ...(command ? { command } : {}),
        ...lambdaOptions,
      } as any,
    },
  };
}
