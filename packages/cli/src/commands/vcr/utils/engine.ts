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

export interface EngineLoginResult {
  exitCode: number;
  stderr: string;
}

/** stderr signatures that mean the registry rejected our credentials. */
export const AUTH_FAILURE = /denied|forbidden|unauthorized|401|403/i;

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
