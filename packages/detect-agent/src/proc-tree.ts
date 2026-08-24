import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { KnownAgentNames } from './index';

export interface ProcessEntry {
  pid: number;
  ppid: number;
  command: string;
}

export interface HarnessMatch {
  name: KnownAgentNames;
  pid: number;
  version?: string;
}

export interface ProcessTreeResult {
  match?: HarnessMatch;
  /** Immediate parent of the CLI process (typically the shell). */
  shellPid?: number;
  /** System boot time (epoch seconds); guards PID reuse across reboots. */
  bootTime?: number;
}

const MAX_DEPTH = 5;
const BUDGET_MS = 250;

// Matched against the ancestor command line. The command line itself never
// leaves this module: only the matched constant name and version do.
const HARNESS_MATCHERS: {
  name: KnownAgentNames;
  re: RegExp;
  packages: string[];
}[] = [
  {
    name: 'claude',
    re: /(^|\/)claude(\s|$)|@anthropic-ai\/claude-code\//,
    packages: ['@anthropic-ai/claude-code'],
  },
  {
    name: 'cursor-cli',
    re: /(^|\/)cursor-agent(\s|$)/,
    packages: [],
  },
  {
    name: 'codex',
    re: /(^|\/)codex(\s|$)|@openai\/codex\//,
    packages: ['@openai/codex'],
  },
  {
    name: 'gemini',
    re: /(^|\/)gemini(\s|$)|@google\/gemini-cli\//,
    packages: ['@google/gemini-cli'],
  },
  {
    name: 'opencode',
    re: /(^|\/)opencode(\s|$)|opencode-ai\//,
    packages: ['opencode-ai'],
  },
  {
    name: 'github-copilot',
    re: /(^|\/)copilot(\s|$)|@github\/copilot\//,
    packages: ['@github/copilot'],
  },
];

export function matchHarness(
  command: string
): { name: KnownAgentNames; packages: string[] } | undefined {
  return HARNESS_MATCHERS.find(m => m.re.test(command));
}

/** Parses `/proc/<pid>/stat`; the comm field may contain spaces/parens. */
export function parseProcStat(
  stat: string
): { pid: number; ppid: number } | undefined {
  const close = stat.lastIndexOf(')');
  if (close === -1) return undefined;
  const pid = Number.parseInt(stat.slice(0, stat.indexOf(' ')), 10);
  const rest = stat.slice(close + 2).split(' ');
  const ppid = Number.parseInt(rest[1], 10);
  if (Number.isNaN(pid) || Number.isNaN(ppid)) return undefined;
  return { pid, ppid };
}

/** Parses `ps -ax -o pid=,ppid=,command=` output. */
export function parsePsOutput(out: string): Map<number, ProcessEntry> {
  const entries = new Map<number, ProcessEntry>();
  for (const line of out.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (match) {
      const pid = Number.parseInt(match[1], 10);
      entries.set(pid, {
        pid,
        ppid: Number.parseInt(match[2], 10),
        command: match[3],
      });
    }
  }
  return entries;
}

/**
 * Resolves a version for a matched node-based harness by walking up from
 * its script path to the nearest matching package.json.
 */
export function resolveHarnessVersion(
  command: string,
  packages: string[],
  readFile: (path: string) => string = p => readFileSync(p, 'utf8')
): string | undefined {
  const script = command
    .split(' ')
    .find(token => /\.(c|m)?js$/.test(token) && token.includes('/'));
  if (!script) return undefined;

  let dir = dirname(script);
  for (let i = 0; i < 10; i++) {
    try {
      const pkg = JSON.parse(readFile(join(dir, 'package.json')));
      if (
        packages.includes(pkg.name) &&
        typeof pkg.version === 'string' &&
        /^[\w.+-]{1,32}$/.test(pkg.version)
      ) {
        return pkg.version;
      }
    } catch {
      // keep walking up
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export function findHarness(
  ancestors: ProcessEntry[],
  readFile?: (path: string) => string
): HarnessMatch | undefined {
  for (const entry of ancestors) {
    const matcher = matchHarness(entry.command);
    if (matcher) {
      return {
        name: matcher.name,
        pid: entry.pid,
        version: resolveHarnessVersion(
          entry.command,
          matcher.packages,
          readFile
        ),
      };
    }
  }
  return undefined;
}

function getAncestorsLinux(pid: number): ProcessEntry[] {
  const ancestors: ProcessEntry[] = [];
  let current = pid;
  for (let i = 0; i < MAX_DEPTH && current > 1; i++) {
    try {
      const stat = parseProcStat(readFileSync(`/proc/${current}/stat`, 'utf8'));
      if (!stat) break;
      const command = readFileSync(`/proc/${current}/cmdline`, 'utf8')
        .split('\0')
        .join(' ')
        .trim();
      ancestors.push({ pid: current, ppid: stat.ppid, command });
      current = stat.ppid;
    } catch {
      break;
    }
  }
  return ancestors;
}

function execOnce(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: BUDGET_MS * 4 }, (err, stdout) =>
      err ? reject(err) : resolve(stdout)
    );
  });
}

async function getAncestorsDarwin(pid: number): Promise<ProcessEntry[]> {
  const table = parsePsOutput(
    await execOnce('ps', ['-ax', '-o', 'pid=,ppid=,command='])
  );
  const ancestors: ProcessEntry[] = [];
  let current = pid;
  for (let i = 0; i < MAX_DEPTH && current > 1; i++) {
    const entry = table.get(current);
    if (!entry) break;
    ancestors.push(entry);
    current = entry.ppid;
  }
  return ancestors;
}

async function getBootTime(
  platform: NodeJS.Platform
): Promise<number | undefined> {
  try {
    if (platform === 'linux') {
      const btime = readFileSync('/proc/stat', 'utf8').match(/^btime (\d+)$/m);
      return btime ? Number.parseInt(btime[1], 10) : undefined;
    }
    if (platform === 'darwin') {
      const out = await execOnce('sysctl', ['-n', 'kern.boottime']);
      const sec = out.match(/sec\s*=\s*(\d+)/);
      return sec ? Number.parseInt(sec[1], 10) : undefined;
    }
  } catch {
    // fail open
  }
  return undefined;
}

/**
 * Walks up to five process ancestors looking for a known agent harness.
 * Linux and macOS only; anything else (or exceeding the time budget)
 * resolves to an empty result.
 */
export async function inspectProcessTree(
  opts: { pid?: number; platform?: NodeJS.Platform } = {}
): Promise<ProcessTreeResult> {
  const platform = opts.platform ?? process.platform;
  const pid = opts.pid ?? process.ppid;

  if (platform !== 'linux' && platform !== 'darwin') {
    return {};
  }

  const inspect = async (): Promise<ProcessTreeResult> => {
    const ancestors =
      platform === 'linux'
        ? getAncestorsLinux(pid)
        : await getAncestorsDarwin(pid);
    return {
      match: findHarness(ancestors),
      shellPid: pid,
      bootTime: await getBootTime(platform),
    };
  };

  const budget = new Promise<ProcessTreeResult>(resolve => {
    const timer = setTimeout(() => resolve({}), BUDGET_MS);
    timer.unref?.();
  });

  try {
    return await Promise.race([inspect(), budget]);
  } catch {
    return {};
  }
}
