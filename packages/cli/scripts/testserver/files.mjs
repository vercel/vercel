// Workspace helpers more than one Testserver runner build mode uses: the
// install inputs and workspace patterns, the pnpm version, and packing files
// into a tarball. A helper only one mode uses lives in that mode's file under
// modes/.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

/**
 * An error with a message meant for the developer, without a stack. `hint`,
 * when set, is a line printed after the message: another way to run.
 */
export class RunnerError extends Error {
  /**
   * @param {string} message
   * @param {{ hint?: string }} [options]
   */
  constructor(message, { hint } = {}) {
    super(message);
    this.name = 'RunnerError';
    /** @type {string | undefined} */
    this.hint = hint;
  }
}

/** The root files `pnpm install` reads, besides the workspace manifests. */
export const ROOT_INSTALL_INPUTS = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.npmrc',
];

/** The `packages:` list of pnpm-workspace.yaml, without a YAML parser. */
export function parseWorkspacePatterns(yaml) {
  const patterns = [];
  let inPackages = false;
  for (const line of yaml.split(/\r?\n/)) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    const item = /^\s+-\s+(['"]?)(.+?)\1\s*(#.*)?$/.exec(line);
    if (item) {
      patterns.push(item[2]);
    } else if (line.trim() !== '' && !line.trim().startsWith('#')) {
      break;
    }
  }
  return patterns;
}

/** The workspace patterns from `repoRoot`'s pnpm-workspace.yaml, if any. */
export function workspacePatterns(repoRoot) {
  const path = join(repoRoot, 'pnpm-workspace.yaml');
  return existsSync(path)
    ? parseWorkspacePatterns(readFileSync(path, 'utf8'))
    : [];
}

/**
 * A supported pnpm workspace pattern: `{ negated, dir }` for one directory,
 * or `{ negated, parent }` for `parent/*`. Directory paths are normalized
 * to match Git-relative paths. Throws on other globs.
 */
export function parseWorkspacePattern(pattern) {
  const negated = pattern.startsWith('!');
  const clean = (negated ? pattern.slice(1) : pattern).replace(/\/+$/, '');
  if (clean.endsWith('/*')) {
    const parent = posix.normalize(clean.slice(0, -2)).replace(/\/+$/, '');
    return { negated, parent };
  }
  if (clean.includes('*')) {
    throw new RunnerError(
      `Unsupported pnpm-workspace.yaml pattern \`${pattern}\`; extend parseWorkspacePattern() in scripts/testserver/files.mjs`
    );
  }
  return { negated, dir: posix.normalize(clean) };
}

/** The pnpm version from a root package.json's `packageManager`. */
export function parsePnpmVersion(packageJson) {
  const pkg = JSON.parse(packageJson);
  const match = /^pnpm@([^+\s]+)/.exec(pkg.packageManager ?? '');
  if (!match) {
    throw new RunnerError(
      'The root package.json has no `packageManager: pnpm@<version>`'
    );
  }
  return match[1];
}

/**
 * gzip tarball of `paths` (relative to `cwd`) with the system tar, in memory.
 * `tar` is the tar command, replaceable in tests.
 */
export function createTarball(cwd, paths, tar = 'tar') {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(tar, ['--null', '-czf', '-', '-C', cwd, '-T', '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      // macOS tar: no AppleDouble `._*` files.
      env: { ...process.env, COPYFILE_DISABLE: '1' },
    });
    const chunks = [];
    let stderr = '';
    let stdinError;
    child.stdout.on('data', chunk => chunks.push(chunk));
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    // tar can exit before reading the whole path list (EPIPE). Without a
    // listener that error crashes the process and skips the runner's cleanup;
    // `close` reports the failure instead.
    child.stdin.on('error', err => {
      stdinError = err;
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0 && !stdinError) {
        resolvePromise(Buffer.concat(chunks));
      } else if (code === 0) {
        // tar succeeded without reading every path: the tarball is incomplete.
        reject(
          new RunnerError(
            `tar did not read the whole path list: ${stdinError.message}`
          )
        );
      } else {
        reject(new RunnerError(`tar failed (exit ${code}): ${stderr.trim()}`));
      }
    });
    child.stdin.end(paths.map(p => `${p}\0`).join(''));
  });
}
