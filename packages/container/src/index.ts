import { getInternalServiceFunctionPath } from '@vercel/build-utils';
import type { BuildOptions, BuildResultV2 } from '@vercel/build-utils';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const version = 2;

/**
 * Host of the Vercel Container Registry. Overridable for local testing against
 * a different registry.
 */
const VCR_REGISTRY = process.env.VERCEL_VCR_REGISTRY || 'vcr.vercel.com';

/** Images must target linux/amd64 — that's the only arch Hive runs today. */
const TARGET_PLATFORM = 'linux/amd64';

const DIGEST_RE = /sha256:[a-f0-9]{64}/;

/**
 * Verbose tracing for the container builder. Enabled with `vercel build --debug`
 * (which sets `VERCEL_DEBUG`) or by exporting `VERCEL_CONTAINER_DEBUG=1`.
 */
const DEBUG =
  process.env.VERCEL_CONTAINER_DEBUG === '1' ||
  process.env.VERCEL_DEBUG === '1' ||
  process.env.BUILDER_DEBUG === '1';

function write(line: string): void {
  process.stderr.write(`${line}\n`);
}

/** Top-level milestone, prefixed with the Vercel mark. */
function info(message: string): void {
  write(`▲ container  ${message}`);
}

/** A step that's starting. */
function step(message: string): void {
  write(`  → ${message}`);
}

/** A step that finished successfully. */
function done(message: string): void {
  write(`  ✓ ${message}`);
}

function debug(message: string): void {
  if (DEBUG) {
    write(`  · ${message}`);
  }
}

function elapsed(since: number): string {
  return `${((Date.now() - since) / 1000).toFixed(1)}s`;
}

/** Shorten a `sha256:…` digest for display. */
function shortDigest(digest: string): string {
  return digest.startsWith('sha256:') ? `${digest.slice(0, 19)}…` : digest;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Describe a secret token for debug logs without leaking it: reports presence,
 * length, and a short non-reversible sha256 prefix so the same token can be
 * correlated across systems without exposing its value.
 */
function tokenFingerprint(token: string | undefined): string {
  if (!token) return 'absent';
  const sha = createHash('sha256').update(token).digest('hex').slice(0, 8);
  return `present(len=${token.length}, sha256=${sha})`;
}

/**
 * Log the non-secret claims of a Vercel OIDC JWT (issuer, audience, owner,
 * project, expiry, etc.) to help debug registry authorization. Only the
 * signature is sensitive; the claims themselves identify the scope of the
 * token, which is exactly what's useful when a registry rejects it.
 */
function debugTokenClaims(label: string, token: string | undefined): void {
  if (!DEBUG) return;
  if (!token) {
    debug(`${label}: <absent>`);
    return;
  }
  try {
    const payload = token.split('.')[1];
    if (!payload) {
      debug(`${label}: <not a JWT>`);
      return;
    }
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    ) as Record<string, unknown>;
    const safe = {
      iss: claims.iss,
      aud: claims.aud,
      sub: claims.sub,
      scope: claims.scope,
      owner: claims.owner,
      owner_id: claims.owner_id,
      project: claims.project,
      project_id: claims.project_id,
      exp:
        typeof claims.exp === 'number'
          ? `${new Date(claims.exp * 1000).toISOString()} (in ${Math.round(
              (claims.exp * 1000 - Date.now()) / 1000
            )}s)`
          : claims.exp,
    };
    debug(`${label}: ${JSON.stringify(safe)}`);
  } catch (err) {
    debug(`${label}: <unparseable claims> (${(err as Error).message})`);
  }
}

interface OidcClaims {
  /** Team slug, e.g. `acme`. */
  owner?: string;
  /** Team id, used as the registry login username, e.g. `team_abc123`. */
  owner_id?: string;
  /** Project slug, e.g. `my-app`. */
  project?: string;
  /** Project id, e.g. `prj_abc123`, required to create a repository. */
  project_id?: string;
}

/** Decode the (unverified) claims from a Vercel OIDC JWT. */
function decodeOidcClaims(token: string | undefined): OidcClaims {
  if (!token) return {};
  try {
    const payload = token.split('.')[1];
    if (!payload) return {};
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(json) as OidcClaims;
  } catch {
    return {};
  }
}

/**
 * Whether a container `entrypoint` points at a Dockerfile to build (rather than
 * an already-published image reference). Matches `Dockerfile`, `Containerfile`,
 * and `*.Dockerfile`.
 */
function isDockerfileRef(ref: string): boolean {
  const base = path.basename(ref).toLowerCase();
  return (
    base === 'dockerfile' ||
    base === 'containerfile' ||
    base.endsWith('.dockerfile')
  );
}

/**
 * Turn an arbitrary service name into a registry-safe repository name.
 */
function sanitizeRepository(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9-_./]/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^[-/.]+)|([-/.]+$)/g, '');
  return sanitized || 'service';
}

/**
 * Pick a deterministic-ish tag for the pushed image. The immutable digest is
 * what ultimately flows downstream, so the tag is mostly for humans.
 */
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

interface RunResult {
  stdout: string;
  stderr: string;
}

/**
 * Run a command, streaming its output to stderr (so `docker build` progress is
 * visible in build logs) while capturing it for parsing.
 */
function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; input?: string; quiet?: boolean } = {}
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      stdio: [opts.input !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      if (!opts.quiet) {
        process.stderr.write(text);
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      if (!opts.quiet) {
        process.stderr.write(text);
      }
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(
          new Error(
            `Command not found: \`${cmd}\`. Ensure \`${cmd}\` is installed and on your PATH.`
          )
        );
        return;
      }
      reject(err);
    });
    child.on('close', code => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        // Surface the tail of stderr so the failure is actionable even when the
        // child's output was captured quietly.
        const detail = stderr.trim().split('\n').slice(-5).join('\n');
        reject(
          new Error(
            `\`${cmd} ${args.join(' ')}\` exited with code ${code}` +
              (detail ? `\n${detail}` : '')
          )
        );
      }
    });

    if (opts.input !== undefined) {
      child.stdin?.end(opts.input);
    }
  });
}

/**
 * Block until the pushed image is usable. The authoritative readiness signal is
 * api-vcr reporting `image.vhs`/`ready` once OCI->VHS conversion completes
 * (~30-60s after push). When that endpoint is available, point
 * `VERCEL_VCR_READY_URL` at it (it's polled with the OIDC token as a bearer and
 * treated ready when the response has `ready: true` or a truthy `vhs`).
 *
 * Without a configured endpoint we fall back to confirming the pushed digest
 * resolves in the registry. This is a temporary gate — readiness will likely
 * move into api-builds once the flow is wired end to end.
 */
async function waitForImageReady(imageRef: string): Promise<void> {
  if (process.env.VERCEL_VCR_SKIP_READY_CHECK === '1') {
    return;
  }

  const timeoutMs = Number(process.env.VERCEL_VCR_READY_TIMEOUT_MS) || 300_000;
  const intervalMs = Number(process.env.VERCEL_VCR_READY_INTERVAL_MS) || 3_000;
  const readyUrl = readString(process.env.VERCEL_VCR_READY_URL);
  const token = readString(process.env.VERCEL_OIDC_TOKEN);
  const deadline = Date.now() + timeoutMs;

  debug(
    readyUrl
      ? `readiness: polling ${readyUrl} every ${intervalMs}ms (timeout ${Math.round(timeoutMs / 1000)}s)`
      : `readiness: VERCEL_VCR_READY_URL unset — confirming digest resolves via \`docker manifest inspect\` (timeout ${Math.round(timeoutMs / 1000)}s)`
  );

  let attempt = 0;
  for (;;) {
    attempt++;
    try {
      if (readyUrl) {
        const res = await fetch(readyUrl, {
          headers: token ? { authorization: `Bearer ${token}` } : {},
        });
        debug(`readiness attempt ${attempt}: HTTP ${res.status}`);
        if (res.ok) {
          const body = (await res.json()) as {
            ready?: boolean;
            vhs?: unknown;
          };
          if (body.ready === true || Boolean(body.vhs)) {
            return;
          }
        }
      } else {
        await run('docker', ['manifest', 'inspect', imageRef], { quiet: true });
        debug(`readiness attempt ${attempt}: manifest resolved`);
        return;
      }
    } catch (err) {
      // Not ready yet — keep polling until the deadline.
      debug(
        `readiness attempt ${attempt}: not ready (${(err as Error).message})`
      );
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out after ${Math.round(
          timeoutMs / 1000
        )}s waiting for "${imageRef}" to become ready in the Vercel Container Registry.`
      );
    }
    await delay(intervalMs);
  }
}

/**
 * Verify the Docker CLI is installed and the daemon is reachable before we try
 * to build, so failures point at the real problem (missing CLI / stopped
 * daemon) instead of a generic non-zero exit code.
 */
async function ensureDockerReady(): Promise<void> {
  try {
    await run('docker', ['version', '--format', '{{.Server.Version}}'], {
      quiet: true,
    });
  } catch (err) {
    const message = (err as Error).message;

    if (/Command not found/i.test(message)) {
      throw new Error(
        'Docker CLI was not found on your PATH. Install Docker and make sure ' +
          'the `docker` command is available so the container image can be built.'
      );
    }

    throw new Error(
      [
        'Cannot connect to the Docker daemon — is Docker running?',
        '',
        'Start Docker (Docker Desktop, Colima, or OrbStack) and verify it with',
        '`docker info`, then re-run the build. If you use a non-default socket,',
        'set DOCKER_HOST or select the right context with `docker context use`.',
        '',
        `Underlying error: ${message}`,
      ].join('\n')
    );
  }
}

/**
 * Ensure the target VCR repository exists before pushing. Repositories must be
 * created out-of-band today (a push to a missing repo is denied with 404), so
 * the build creates it idempotently via the Vercel API. A 409 means it already
 * exists. This is best-effort: on failure we log and continue, letting the push
 * surface a clear, actionable error.
 */
async function ensureRepository(
  repository: string,
  token: string,
  claims: OidcClaims
): Promise<void> {
  // Only auto-create bare repo names. A slash means the caller fully qualified
  // the path and we can't reliably infer the owning project.
  if (repository.includes('/')) {
    debug(`skipping repository auto-create (fully-qualified "${repository}")`);
    return;
  }

  const teamId = readString(process.env.VERCEL_VCR_USERNAME) ?? claims.owner_id;
  const projectId =
    readString(process.env.VERCEL_VCR_PROJECT_ID) ?? claims.project_id;
  if (!teamId || !projectId) {
    debug(
      `skipping repository auto-create (missing ${
        !teamId ? 'team id' : 'project id'
      })`
    );
    return;
  }

  const apiUrl = (
    readString(process.env.VERCEL_API_URL) ?? 'https://api.vercel.com'
  ).replace(/\/+$/, '');
  const url = `${apiUrl}/v1/vcr/repository?teamId=${encodeURIComponent(teamId)}`;
  const body = JSON.stringify({ name: repository, projectId });

  step(`Ensuring registry repository "${repository}"`);
  debug(`repository create: POST ${url}`);
  debug(`repository create body: ${body}`);
  debug(
    `repository create auth: Bearer ${tokenFingerprint(token)} (teamId=${teamId}, projectId=${projectId})`
  );
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body,
    });
    if (res.ok) {
      debug(`repository create returned ${res.status}`);
      done(`created repository "${repository}"`);
    } else if (res.status === 409) {
      debug(`repository create returned 409 (already exists)`);
      done(`repository "${repository}" already exists`);
    } else {
      const text = await res.text().catch(() => '');
      debug(
        `repository auto-create returned ${res.status}: ${text.slice(0, 500)}`
      );
      done('continuing — push will validate the repository');
    }
  } catch (err) {
    debug(`repository auto-create failed: ${(err as Error).message}`);
    done('continuing — push will validate the repository');
  }
}

async function buildAndPushImage(params: {
  contextDir: string;
  dockerfilePath: string;
  repository: string;
  tag: string;
}): Promise<string> {
  const { contextDir, dockerfilePath, repository, tag } = params;

  // The registry password is a Vercel token. Prefer an explicit access token,
  // otherwise use the project's OIDC token (auto-pulled by `vercel build`).
  // VCR pairs each token type with a specific login username: an OIDC token
  // authenticates as the literal user `oidc`, while a Vercel access token
  // authenticates as the team id.
  const accessToken =
    readString(process.env.VERCEL_VCR_TOKEN) ??
    readString(process.env.VERCEL_TOKEN);
  const oidcToken = readString(process.env.VERCEL_OIDC_TOKEN);
  const token = accessToken ?? oidcToken;
  if (!token) {
    throw new Error(
      'Missing a Vercel token for the container registry. Set VERCEL_OIDC_TOKEN ' +
        '(auto-pulled by `vercel build`) or VERCEL_VCR_TOKEN/VERCEL_TOKEN.'
    );
  }
  const usingOidcToken = !accessToken;

  // Token diagnostics (never logs the token itself — only presence/fingerprint
  // and the non-secret OIDC claims). Useful for debugging VCR auth rejections.
  const tokenSource = readString(process.env.VERCEL_VCR_TOKEN)
    ? 'VERCEL_VCR_TOKEN'
    : readString(process.env.VERCEL_TOKEN)
      ? 'VERCEL_TOKEN'
      : 'VERCEL_OIDC_TOKEN';
  debug(
    `token env presence: VERCEL_VCR_TOKEN=${!!readString(
      process.env.VERCEL_VCR_TOKEN
    )}, VERCEL_TOKEN=${!!readString(
      process.env.VERCEL_TOKEN
    )}, VERCEL_OIDC_TOKEN=${!!readString(process.env.VERCEL_OIDC_TOKEN)}`
  );
  debug(
    `registry token: source=${tokenSource}, usingOidcToken=${usingOidcToken}, ${tokenFingerprint(
      token
    )}`
  );
  debugTokenClaims(
    'OIDC token claims',
    readString(process.env.VERCEL_OIDC_TOKEN)
  );

  // Repositories are namespaced as `<team_slug>/<project_slug>/<repo>`. Derive
  // the slugs from the OIDC token claims, allowing env overrides. The login
  // username depends on the token type: `oidc` for an OIDC token, otherwise the
  // team id for an access token.
  const claims = decodeOidcClaims(readString(process.env.VERCEL_OIDC_TOKEN));
  const username =
    readString(process.env.VERCEL_VCR_USERNAME) ??
    (usingOidcToken ? 'oidc' : claims.owner_id);
  if (!username) {
    throw new Error(
      'Could not determine the container registry login username. Set ' +
        'VERCEL_VCR_USERNAME (team id for an access token, or `oidc`).'
    );
  }

  // VCR is project-scoped: the full registry name is
  // `<team_slug>/<project_slug>/<repo>`. Derive the team/project slugs from the
  // OIDC token claims (env-overridable). A repository that already contains a
  // slash is treated as fully-qualified and used verbatim.
  const teamSlug = readString(process.env.VERCEL_VCR_TEAM_SLUG) ?? claims.owner;
  const projectSlug =
    readString(process.env.VERCEL_VCR_PROJECT_SLUG) ?? claims.project;
  const fullRepository = repository.includes('/')
    ? repository
    : [teamSlug, projectSlug, repository].filter(Boolean).join('/');

  const imageRef = `${VCR_REGISTRY}/${fullRepository}:${tag}`;

  // The control-plane create endpoint accepts the project's OIDC token, so
  // prefer it for repository creation regardless of the registry push token.
  const createToken = readString(process.env.VERCEL_OIDC_TOKEN) ?? token;
  await ensureRepository(repository, createToken, claims);

  await ensureDockerReady();

  info(`Building image ${imageRef}`);
  debug(`dockerfile: ${dockerfilePath}`);
  debug(`context:    ${contextDir}`);
  debug(`platform:   ${TARGET_PLATFORM}`);
  debug(`registry:   ${VCR_REGISTRY}`);
  debug(`username:   ${username}`);
  debug(`repository: ${fullRepository}`);

  const buildStart = Date.now();
  step(`docker build (${TARGET_PLATFORM})`);
  await run('docker', [
    'build',
    '--platform',
    TARGET_PLATFORM,
    '-t',
    imageRef,
    '-f',
    dockerfilePath,
    contextDir,
  ]);
  done(`built in ${elapsed(buildStart)}`);

  // Authenticate to VCR: password is the token (passed via stdin, never argv);
  // username is `oidc` for an OIDC token, otherwise the team id.
  step(`Authenticating to ${VCR_REGISTRY} as ${username}`);
  debug(
    `exec: docker login ${VCR_REGISTRY} --username ${username} --password-stdin ` +
      `(password from ${tokenSource} on stdin, ${tokenFingerprint(token)})`
  );
  try {
    await run(
      'docker',
      ['login', VCR_REGISTRY, '--username', username, '--password-stdin'],
      { input: token, quiet: !DEBUG }
    );
  } catch (err) {
    const message = (err as Error).message;
    if (/denied|forbidden|unauthorized|401|403/i.test(message)) {
      const teamId =
        claims.owner_id ?? readString(process.env.VERCEL_VCR_USERNAME);
      throw new Error(
        [
          `Authentication to ${VCR_REGISTRY} as "${username}" was rejected.`,
          '',
          `Make sure your team (${teamId ? `"${teamId}"` : ''}) is enrolled in`,
          'the `vercel-enable-vcr` flag, and that the token is valid for it.',
          'Override credentials with VERCEL_VCR_USERNAME (`oidc` for an OIDC',
          'token, or the team id for a VERCEL_VCR_TOKEN access token).',
          '',
          `Underlying error: ${message}`,
        ].join('\n')
      );
    }
    throw err;
  }
  done('authenticated');

  const pushStart = Date.now();
  step(`Pushing ${imageRef}`);
  let stdout: string;
  try {
    ({ stdout } = await run('docker', ['push', imageRef]));
  } catch (err) {
    const message = (err as Error).message;
    if (/denied|forbidden|unauthorized|not found|401|403|404/i.test(message)) {
      throw new Error(
        [
          `Pushing ${imageRef} was denied.`,
          '',
          `The build tried to ensure the "${repository}" repository exists, but`,
          'the push was still rejected. This usually means the token lacks access',
          'to the project, or your team is not enrolled in the `vercel-enable-vcr`',
          "flag. Verify access (or create the repository under your project's",
          'Sandboxes → Container Registry tab), then re-run the build.',
          '',
          `Underlying error: ${message}`,
        ].join('\n')
      );
    }
    throw err;
  }

  // Prefer the immutable digest so api-builds resolves a stable image.
  let digest = stdout.match(DIGEST_RE)?.[0];
  if (!digest) {
    debug('digest not found in push output — inspecting RepoDigests');
    const inspect = await run(
      'docker',
      ['inspect', '--format', '{{index .RepoDigests 0}}', imageRef],
      { quiet: true }
    );
    digest = inspect.stdout.match(DIGEST_RE)?.[0];
  }
  done(
    digest
      ? `pushed ${shortDigest(digest)} in ${elapsed(pushStart)}`
      : `pushed in ${elapsed(pushStart)}`
  );

  const resolvedRef = digest
    ? `${VCR_REGISTRY}/${fullRepository}@${digest}`
    : imageRef;

  // Block until the OCI->VHS conversion has completed so downstream routing can
  // boot the image immediately.
  const readyStart = Date.now();
  step('Waiting for image to be ready (OCI → VHS conversion)');
  await waitForImageReady(resolvedRef);
  done(`ready in ${elapsed(readyStart)}`);

  info(`Image reference ${resolvedRef}`);

  return resolvedRef;
}

/**
 * Resolve the container image reference for this service. Either:
 *  - build a Dockerfile and push it to VCR, returning the pushed digest, or
 *  - pass through a prebuilt image reference from the service config/entrypoint.
 */
async function resolveImageHandler(options: BuildOptions): Promise<string> {
  const { config, workPath, entrypoint, meta } = options;

  const entrypointRef = readString(entrypoint);
  // A container service builds from a Dockerfile when one is configured, when
  // the entrypoint points at a Dockerfile, or when a `Dockerfile` exists in the
  // work dir. Otherwise the entrypoint is a prebuilt image reference.
  const dockerfileConfigured =
    readString(config.dockerfile) ??
    (entrypointRef && isDockerfileRef(entrypointRef)
      ? entrypointRef
      : undefined);
  const dockerfileRel = dockerfileConfigured ?? 'Dockerfile';
  const dockerfilePath = path.join(workPath, dockerfileRel);
  const hasDockerfile =
    dockerfileConfigured !== undefined || existsSync(dockerfilePath);

  const prebuiltImage =
    readString(config.handler) ??
    readString(config.image) ??
    (hasDockerfile ? undefined : entrypointRef);

  debug(`workPath:    ${workPath}`);
  debug(
    `dockerfile:  ${dockerfileRel} (exists: ${existsSync(dockerfilePath)})`
  );
  debug(`prebuilt:    ${prebuiltImage ?? '<none>'}`);
  debug(`isDev:       ${Boolean(meta?.isDev)}`);

  if (!hasDockerfile) {
    if (!prebuiltImage) {
      throw new Error(
        'Container service must specify a prebuilt image (via "image"/entrypoint) or a "dockerfile" to build.'
      );
    }
    info(`Using prebuilt image ${prebuiltImage}`);
    return prebuiltImage;
  }

  // `vercel dev` can't build & push images; fall back to a prebuilt reference.
  if (meta?.isDev) {
    if (prebuiltImage) {
      info(`vercel dev: using prebuilt image ${prebuiltImage}`);
      return prebuiltImage;
    }
    throw new Error(
      '`vercel dev` cannot build container images from a Dockerfile. Specify a prebuilt "image" for local development.'
    );
  }

  if (!existsSync(dockerfilePath)) {
    throw new Error(
      `Dockerfile not found at "${dockerfilePath}" for container service.`
    );
  }

  // A fully-qualified repository (with slashes) is preserved as-is; a bare name
  // gets namespaced under the team/project at push time.
  const repositoryConfigured =
    readString(config.repository) ??
    readString(process.env.VERCEL_VCR_REPOSITORY) ??
    options.service?.name ??
    'service';
  const repository = repositoryConfigured.includes('/')
    ? repositoryConfigured
    : sanitizeRepository(repositoryConfigured);
  const tag = resolveImageTag();
  // Default the build context to the Dockerfile's directory (Docker convention),
  // which keeps the context small without special-casing service roots.
  const contextDir = readString(config.context)
    ? path.join(workPath, config.context as string)
    : path.dirname(dockerfilePath);

  return buildAndPushImage({ contextDir, dockerfilePath, repository, tag });
}

export async function build(options: BuildOptions): Promise<BuildResultV2> {
  const handler = await resolveImageHandler(options);

  const command = normalizeCommand(options.config.command);

  const outputPath = options.service?.name
    ? getInternalServiceFunctionPath(options.service.name).replace(/^\//, '')
    : 'index';

  return {
    output: {
      [outputPath]: {
        // Emit a Lambda-typed output with `runtime: 'container'`. The build
        // container keys off `type === 'Lambda' && runtime === 'container'`
        // (vercel/api#74661) to collect container image functions, so the
        // output must use the `Lambda` discriminator rather than a bespoke type.
        type: 'Lambda',
        files: {},
        handler,
        runtime: 'container',
        environment: {},
        ...(command ? { command } : {}),
      } as any,
    },
  };
}
