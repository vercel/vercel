import which from 'which';
import execa from 'execa';
import { VCR_REGISTRY } from './format';

export const VCR_ENGINES = ['docker', 'podman', 'buildah'] as const;
export type VcrEngine = (typeof VCR_ENGINES)[number];

export const VCR_LOGIN_USERNAME = 'oidc';

export function resolveRegistry(): string {
  return process.env.VERCEL_VCR_REGISTRY || VCR_REGISTRY;
}

export function isEngineInstalled(engine: VcrEngine): boolean {
  return which.sync(engine, { nothrow: true }) !== null;
}

/**
 * Splits the caller's argv at `--`: everything before is parsed as Vercel
 * arguments, everything after is forwarded verbatim to the engine. The router's
 * permissive parse drops the `--` marker, so it is recovered from `client.argv`
 * (same approach as `vercel env pull -- <cmd>`).
 */
export function splitPassthrough(argv: string[]): {
  own: string[];
  passthrough: string[];
} {
  const idx = argv.indexOf('--');
  if (idx === -1) {
    return { own: argv.slice(2), passthrough: [] };
  }
  return { own: argv.slice(2, idx), passthrough: argv.slice(idx + 1) };
}

/**
 * Docker only supports zstd compression through the Buildx `--output` exporter,
 * which fuses build and push into one step. Detect it by probing `docker buildx
 * version` (Buildx is a CLI plugin, so it is not always on PATH as its own
 * binary).
 */
export async function isBuildxAvailable(): Promise<boolean> {
  const result = await execa('docker', ['buildx', 'version'], {
    reject: false,
    stdio: 'ignore',
  });
  if (result instanceof Error) {
    return false;
  }
  return result.exitCode === 0;
}

/**
 * Compression flags for a standalone `push`. Podman and Buildah accept
 * `--compression-format` and default to zstd for smaller, faster images; Docker
 * cannot compress on a plain `push` (it needs the Buildx build+push path).
 */
export function pushCompressionArgs(engine: VcrEngine): string[] {
  if (engine === 'docker') {
    return [];
  }
  return ['--compression-format', 'zstd', '--compression-level', '3'];
}

export interface EngineLoginResult {
  exitCode: number;
  stderr: string;
}

/**
 * stderr signatures that mean the registry rejected our credentials. Anchored on
 * the OCI/registry error-code format (`unauthorized:`, `denied:`, `forbidden:`)
 * and the canonical auth phrases, so a build-step failure that merely mentions
 * "permission denied" or an incidental `401`/`403` in progress output is not
 * misread as an auth failure (the fused Buildx build+push emits the whole build
 * log on stderr).
 */
export const AUTH_FAILURE =
  /\b(?:unauthorized|denied|forbidden)\b\s*:|authentication required|access to the resource is denied|\b(?:401 unauthorized|403 forbidden)\b/i;

/** Last few lines of engine stderr, for surfacing an unexpected failure. */
export function stderrTail(stderr: string): string {
  return stderr.trim().split('\n').slice(-5).join('\n');
}

export async function engineLogin(
  engine: VcrEngine,
  registry: string,
  token: string
): Promise<EngineLoginResult> {
  const result = await execa(
    engine,
    ['login', registry, '--username', VCR_LOGIN_USERNAME, '--password-stdin'],
    { input: token, reject: false }
  );

  // With `reject: false`, a spawn failure (e.g. the binary vanished from PATH
  // between detection and exec) resolves to an Error without a numeric exitCode
  // rather than throwing.
  if (result instanceof Error && typeof result.exitCode !== 'number') {
    return { exitCode: 1, stderr: result.message };
  }

  return {
    exitCode: typeof result.exitCode === 'number' ? result.exitCode : 1,
    stderr: result.stderr ?? '',
  };
}

export interface EngineRunResult {
  exitCode: number;
  stderr: string;
}

/**
 * Runs an engine subcommand (build/push) with the engine's own output streamed
 * straight to the terminal. `build` inherits stdio so BuildKit renders its
 * native progress UI; `push` additionally captures stderr (while still
 * streaming it live) so the caller can match auth-failure signatures.
 */
export async function runEngine(
  engine: VcrEngine,
  args: string[],
  opts: { cwd: string; captureStderr?: boolean }
): Promise<EngineRunResult> {
  if (opts.captureStderr) {
    const subprocess = execa(engine, args, {
      cwd: opts.cwd,
      stdio: ['inherit', 'inherit', 'pipe'],
      reject: false,
    });
    subprocess.stderr?.pipe(process.stderr);
    const result = await subprocess;
    if (result instanceof Error && typeof result.exitCode !== 'number') {
      return { exitCode: 1, stderr: result.message };
    }
    return {
      exitCode: typeof result.exitCode === 'number' ? result.exitCode : 1,
      stderr: result.stderr ?? '',
    };
  }

  const result = await execa(engine, args, {
    cwd: opts.cwd,
    stdio: 'inherit',
    reject: false,
  });
  if (result instanceof Error && typeof result.exitCode !== 'number') {
    return { exitCode: 1, stderr: result.message };
  }
  return {
    exitCode: typeof result.exitCode === 'number' ? result.exitCode : 1,
    stderr: '',
  };
}
