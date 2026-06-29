import type { Span } from '@vercel/build-utils';

export const VCR_REGISTRY = process.env.VERCEL_VCR_REGISTRY || 'vcr.vercel.com';

/** Images must target linux/amd64 — the only architecture currently supported. */
export const TARGET_PLATFORM = 'linux/amd64';

export const DIGEST_RE = /sha256:[a-f0-9]{64}/;

/** Build `--build-arg KEY=VALUE` flags from the params' project build env. */
export function buildArgFlags(params: { buildArgs?: Record<string, string> }) {
  const flags: string[] = [];
  for (const [key, value] of Object.entries(params.buildArgs ?? {})) {
    flags.push('--build-arg', `${key}=${value}`);
  }
  return flags;
}

export interface BuildPushParams {
  contextDir: string;
  dockerfilePath: string;
  imageRef: string;
  registry: string;
  username: string;
  token: string;
  /** Bare repository name (without team/project prefix), for error messages. */
  repository: string;
  /**
   * Project build env (from `meta.buildEnv`) forwarded to the image build as
   * `--build-arg KEY=VALUE`, so Dockerfiles can consume declared `ARG`s during
   * build — matching how other builders run build steps with the build env.
   * Only the project's build env is included, never the build container's own
   * internal environment.
   */
  buildArgs?: Record<string, string>;
  span?: Span;
}

/**
 * Pluggable container image toolchain. Docker is used on developer machines;
 * buildah is used in the Vercel build container (daemonless, smaller footprint).
 */
export interface ContainerEngine {
  readonly name: string;

  /** Verify the toolchain is installed and usable before build/login/push. */
  ensureReady(span?: Span): Promise<void>;

  /** Best-effort diagnostics; must not fail the build. */
  logDiagnostics(span?: Span): Promise<void>;

  /**
   * Prepare the runtime environment (e.g. start dockerd). No-op for daemonless
   * engines. The callback runs build/login/push inside this scope.
   */
  withRuntime<T>(span: Span | undefined, fn: () => Promise<T>): Promise<T>;

  build(params: BuildPushParams): Promise<void>;
  login(params: BuildPushParams): Promise<void>;
  push(params: BuildPushParams): Promise<string | undefined>;

  /**
   * Verify the engine's storage is configured as intended (e.g. native overlay
   * on the mounted cell volume) before building. MAY throw to fail the build
   * fast when storage is misconfigured. Runs before build/login/push.
   */
  verifyStorage?(span?: Span): Promise<void>;

  /**
   * Best-effort report of the engine's effective on-disk image store (graph
   * root, run root, driver, backing filesystem). Used to confirm the build is
   * using the mounted cell storage volume. Must not fail the build.
   */
  reportStorage?(span?: Span): Promise<void>;
}
