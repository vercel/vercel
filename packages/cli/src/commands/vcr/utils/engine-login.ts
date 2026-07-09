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
