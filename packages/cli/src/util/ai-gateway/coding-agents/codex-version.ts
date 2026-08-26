import { execFileSync } from 'node:child_process';

/** First Codex release with command-backed custom-provider authentication. */
export const MIN_CODEX_AUTH_VERSION = '0.118.0';

export interface CodexAuthSupport {
  supported: boolean;
  version: string | null;
}

export function parseCodexVersion(output: string): string | null {
  return output.match(/\d+\.\d+\.\d+/)?.[0] ?? null;
}

export function supportsAuthCommand(version: string): boolean {
  const parts = version.split('.').map(Number);
  const min = MIN_CODEX_AUTH_VERSION.split('.').map(Number);
  for (let i = 0; i < min.length; i++) {
    if (parts[i] !== min[i]) {
      return parts[i] > min[i];
    }
  }
  return true;
}

export function detectCodexAuthSupport(): CodexAuthSupport {
  let out: string;
  try {
    out = execFileSync('codex', ['--version'], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return { supported: false, version: null };
  }
  const version = parseCodexVersion(out);
  return version
    ? { supported: supportsAuthCommand(version), version }
    : { supported: false, version: null };
}
