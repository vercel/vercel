import type { BuildOptions, BuildResultV2, Span } from '@vercel/build-utils';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  selectContainerEngine,
  VCR_REGISTRY,
  TARGET_PLATFORM,
} from './engines';
import type { BuildPushParams } from './engines/types';
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
  isDockerfileRef,
  readString,
  shortDigest,
  step,
  tokenFingerprint,
  toTag,
  withSpan,
} from './util';

export const version = 2;

export { startDevServer } from './dev';
export { prepareCache } from './prepare-cache';

function normalizeCommand(command: unknown): string[] | undefined {
  if (typeof command === 'string') {
    return [command];
  }
  if (
    Array.isArray(command) &&
    command.every(item => typeof item === 'string')
  ) {
    return command;
  }
  return undefined;
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
      const token = await withSpan(buildSpan, 'container.mint_oidc', {}, s =>
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

      const fullRepository = [claims.owner, claims.project, repository].join(
        '/'
      );
      const imageRef = `${VCR_REGISTRY}/${fullRepository}:${tag}`;

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

        // The build container provisions a registry auth file
        // (`~/.config/containers/auth.json`, vercel/api#76560) that buildah
        // picks up automatically, so skip the redundant explicit login when one
        // exists. Local `vercel build` (docker engine) still logs in.
        // `VERCEL_VCR_FORCE_LOGIN=1` forces an explicit login.
        const forceLogin =
          readString(process.env.VERCEL_VCR_FORCE_LOGIN) === '1';
        const authFile = forceLogin ? undefined : existingRegistryAuthFile();
        if (authFile) {
          debug(`registry auth file present: ${authFile}`);
          step(`Using registry credentials from ${authFile}`);
          buildSpan?.setAttributes({
            'container.registry': VCR_REGISTRY,
            'registry.username': username,
            'registry.auth_file': authFile,
            'registry.login_skipped': toTag(true),
          });
          done('authenticated via provisioned credentials');
        } else {
          step(`Authenticating to ${VCR_REGISTRY} as ${username}`);
          await withSpan(
            buildSpan,
            'container.registry_login',
            {
              'container.registry': VCR_REGISTRY,
              'registry.username': username,
            },
            () => engine.login(buildParams)
          );
          done('authenticated');
        }

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

async function resolveImageHandler(
  options: BuildOptions,
  span?: Span
): Promise<string> {
  const { config, workPath, entrypoint, meta } = options;

  const entrypointRef = readString(entrypoint);
  // An entrypoint that names a Dockerfile (including the `Dockerfile.vercel` /
  // `Containerfile.vercel` opt-in markers) is built directly. Otherwise — e.g.
  // when the `container` framework preset resolves its entrypoint via
  // `<detect>` — discover a Dockerfile in the work directory.
  const dockerfileConfigured =
    entrypointRef && isDockerfileRef(entrypointRef)
      ? entrypointRef
      : findDockerfile(workPath);
  const dockerfileRel = dockerfileConfigured ?? 'Dockerfile';
  const dockerfilePath = path.join(workPath, dockerfileRel);
  const hasDockerfile =
    dockerfileConfigured !== undefined || existsSync(dockerfilePath);

  const prebuiltImage =
    readString(config.handler) ?? (hasDockerfile ? undefined : entrypointRef);

  span?.setAttributes({
    'container.has_dockerfile': toTag(hasDockerfile),
    'container.is_dev': toTag(Boolean(meta?.isDev)),
  });

  if (!hasDockerfile) {
    if (!prebuiltImage) {
      throw new Error(
        'Container service must specify an entrypoint: a prebuilt OCI image reference, or a Dockerfile path to build.'
      );
    }
    span?.setAttributes({ 'container.mode': 'prebuilt' });
    info(`Using prebuilt image ${prebuiltImage}`);
    return prebuiltImage;
  }

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

  const command = normalizeCommand(options.config.command);

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
      } as any,
    },
  };
}
