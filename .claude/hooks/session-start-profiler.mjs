#!/usr/bin/env node
/**
 * Claude Code SessionStart hook: vercel-version-check
 *
 * Checks whether the Vercel CLI is available on the current PATH and prints a
 * warning if it is not found or cannot be executed.
 *
 * Windows note: npm installs an extensionless wrapper script (e.g.
 * `C:\...\npm\vercel`) alongside the actual launchers `vercel.CMD` and
 * `vercel.EXE`.  The extensionless file passes an `fs.accessSync(X_OK)`
 * check on Windows, but `child_process.execFileSync` cannot run it directly
 * and throws ENOENT.  To work around this we probe the extension-bearing
 * candidates BEFORE the extensionless name on Windows.
 */

import { accessSync, constants } from 'node:fs';
import { execFileSync } from 'node:child_process';

const IS_WINDOWS = process.platform === 'win32';

/**
 * Return the ordered list of binary name candidates for `name`.
 *
 * On Windows: `.CMD` and `.EXE` variants come first so that the executableone
 * is found before the extensionless npm wrapper script that cannot be spawned
 * directly.
 *
 * @param {string} name
 * @returns {string[]}
 */
function candidates(name) {
  if (IS_WINDOWS) {
    return [`${name}.CMD`, `${name}.EXE`, `${name}.BAT`, `${name}.COM`, name];
  }
  return [name];
}

/**
 * Resolve the first candidate that (a) exists on PATH and is executable and
 * (b) can actually be spawned to produce output.
 *
 * Returns `null` when no candidate succeeds.
 *
 * @param {string} name
 * @returns {{ path: string; version: string } | null}
 */
function resolveBinaryFromPath(name) {
  const pathDirs = (process.env.PATH ?? '').split(IS_WINDOWS ? ';' : ':');

  for (const candidate of candidates(name)) {
    for (const dir of pathDirs) {
      if (!dir) continue;
      const full = `${dir}${IS_WINDOWS ? '\\' : '/'}${candidate}`;

      // Step 1: does the file exist and is it executable?
      try {
        accessSync(full, constants.X_OK);
      } catch {
        continue;
      }

      // Step 2: can we actually spawn it?  This is the check that fails for
      // the extensionless npm wrapper on Windows.
      try {
        const output = execFileSync(full, ['--version'], {
          encoding: 'utf8',
          timeout: 5000,
        }).trim();
        return { path: full, version: output };
      } catch {
        // ENOENT or non-zero exit — try next candidate
        continue;
      }
    }
  }

  return null;
}

const result = resolveBinaryFromPath('vercel');

if (!result) {
  process.stderr.write(
    [
      '',
      'IMPORTANT: The Vercel CLI is not installed.',
      'Install it with:  npm i -g vercel',
      "Then verify with: vercel --version",
      '',
    ].join('\n')
  );

  if (process.env.VERCEL_PLUGIN_HOOK_DEBUG === '1') {
    process.stderr.write('session-start-profiler:vercel-version-check-failed\n');
  }
} else {
  if (process.env.VERCEL_PLUGIN_HOOK_DEBUG === '1') {
    process.stderr.write(
      `session-start-profiler:vercel-version-check-ok command=${result.path} version=${result.version}\n`
    );
  }
}
