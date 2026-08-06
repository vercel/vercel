import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import output from '../../output-manager';

const execFileAsync = promisify(execFile);

/** Timeout for the `--version` probe. A hung agent CLI must not hang `vercel ship`. */
const VERSION_PROBE_TIMEOUT_MS = 1500;

export type HarnessId =
  | 'claude-code'
  | 'codex'
  | 'opencode'
  | 'pi'
  | 'deepagents';

/**
 * `ready`       — executable found and credentials look present.
 * `unverified`  — executable found, credentials not detected. Still selectable:
 *                 credentials can come from places we cannot cheaply inspect.
 * `missing`     — no executable found.
 */
export type HarnessStatus = 'ready' | 'unverified' | 'missing';

interface HarnessDefinition {
  id: HarnessId;
  label: string;
  /** Executable to look for on PATH. `null` for harnesses with no local CLI. */
  bin: string | null;
  /** Adapter package, dynamically imported only when the harness is selected. */
  adapterPackage: string;
  /** Paths relative to the home directory that indicate prior configuration. */
  configPaths: string[];
  /** Environment variables that can supply credentials. */
  authEnvVars: string[];
  /** Shown when nothing is installed. */
  installHint: string;
}

/**
 * The set of supported harnesses. Adding one is a data change: append an entry
 * and add the adapter to `optionalDependencies`.
 */
export const HARNESS_DEFINITIONS: readonly HarnessDefinition[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    bin: 'claude',
    adapterPackage: '@ai-sdk/harness-claude-code',
    configPaths: ['.claude', '.claude.json'],
    authEnvVars: ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'],
    installHint: 'npm i -g @anthropic-ai/claude-code',
  },
  {
    id: 'codex',
    label: 'Codex',
    bin: 'codex',
    adapterPackage: '@ai-sdk/harness-codex',
    configPaths: ['.codex'],
    authEnvVars: ['OPENAI_API_KEY'],
    installHint: 'npm i -g @openai/codex',
  },
  {
    id: 'opencode',
    label: 'opencode',
    bin: 'opencode',
    adapterPackage: '@ai-sdk/harness-opencode',
    configPaths: ['.config/opencode', '.local/share/opencode'],
    authEnvVars: ['OPENCODE_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY'],
    installHint: 'npm i -g opencode-ai',
  },
  {
    id: 'pi',
    label: 'pi',
    bin: 'pi',
    adapterPackage: '@ai-sdk/harness-pi',
    configPaths: ['.pi'],
    authEnvVars: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'],
    installHint: 'npm i -g @earendil-works/pi-coding-agent',
  },
  {
    id: 'deepagents',
    label: 'DeepAgents',
    bin: null,
    adapterPackage: '@ai-sdk/harness-deepagents',
    configPaths: [],
    authEnvVars: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'],
    installHint: 'npm i -g deepagents-cli',
  },
];

export interface DetectedHarness {
  id: HarnessId;
  label: string;
  status: HarnessStatus;
  adapterPackage: string;
  installHint: string;
  /** Resolved executable path, when found. */
  binPath?: string;
  /** Reported version, when the probe succeeded. */
  version?: string;
  /** Short human-readable explanation of `status`. */
  detail: string;
}

/**
 * Probe the machine for installed coding-agent harnesses.
 *
 * Detection is deliberately tolerant: a harness whose credentials we cannot see
 * is reported as `unverified` rather than `missing`, because credentials may
 * live in a keychain, a config format we do not parse, or an ambient session.
 * Reporting it as missing would block a user who is perfectly able to run.
 */
export async function detectHarnesses(): Promise<DetectedHarness[]> {
  return Promise.all(HARNESS_DEFINITIONS.map(detectHarness));
}

async function detectHarness(
  definition: HarnessDefinition
): Promise<DetectedHarness> {
  const base = {
    id: definition.id,
    label: definition.label,
    adapterPackage: definition.adapterPackage,
    installHint: definition.installHint,
  };

  if (!definition.bin) {
    return { ...base, status: 'missing', detail: 'no local CLI to detect' };
  }

  const binPath = await which(definition.bin);
  if (!binPath) {
    return { ...base, status: 'missing', detail: 'not found on PATH' };
  }

  const version = await probeVersion(binPath);
  const authenticated = await hasCredentials(definition);

  return {
    ...base,
    binPath,
    version,
    status: authenticated ? 'ready' : 'unverified',
    detail: authenticated
      ? 'installed, credentials detected'
      : 'installed, credentials not detected',
  };
}

/**
 * Locate an executable on PATH without shelling out to a shell.
 *
 * `which`/`where` are avoided so behavior does not depend on the user's shell
 * or on Windows having `where` available.
 */
async function which(bin: string): Promise<string | undefined> {
  const pathValue = process.env.PATH;
  if (!pathValue) return undefined;

  const isWindows = process.platform === 'win32';
  const separator = isWindows ? ';' : ':';
  const extensions = isWindows
    ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';')
    : [''];

  for (const dir of pathValue.split(separator)) {
    if (!dir) continue;
    for (const extension of extensions) {
      const candidate = join(dir, `${bin}${extension}`);
      if (await isReadable(candidate)) {
        return candidate;
      }
    }
  }

  return undefined;
}

async function probeVersion(binPath: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(binPath, ['--version'], {
      timeout: VERSION_PROBE_TIMEOUT_MS,
      windowsHide: true,
    });
    // Agent CLIs pad their version output with banners; take the first
    // version-shaped token and fall back to the first non-empty line.
    const text = stdout.trim();
    const match = text.match(/\d+\.\d+\.\d+[^\s]*/);
    return match ? match[0] : (text.split('\n')[0]?.trim() ?? undefined);
  } catch (error) {
    output.debug(
      `harness version probe failed for ${binPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return undefined;
  }
}

async function hasCredentials(definition: HarnessDefinition): Promise<boolean> {
  if (definition.authEnvVars.some(name => Boolean(process.env[name]))) {
    return true;
  }

  // An AI Gateway key or a Vercel OIDC token can back any of these adapters.
  if (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN) {
    return true;
  }

  const home = homedir();
  for (const relative of definition.configPaths) {
    if (await isReadable(join(home, relative))) {
      return true;
    }
  }

  return false;
}

async function isReadable(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Harnesses that can actually be used, in a stable display order. */
export function availableHarnesses(
  harnesses: DetectedHarness[]
): DetectedHarness[] {
  const rank: Record<HarnessStatus, number> = {
    ready: 0,
    unverified: 1,
    missing: 2,
  };
  return harnesses
    .filter(harness => harness.status !== 'missing')
    .sort(
      (a, b) => rank[a.status] - rank[b.status] || a.id.localeCompare(b.id)
    );
}
