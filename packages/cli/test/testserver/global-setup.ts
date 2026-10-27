import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

function newestMtime(dir: string): { mtimeMs: number; path: string } {
  let newest = { mtimeMs: 0, path: dir };
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        const { mtimeMs } = statSync(full);
        if (mtimeMs > newest.mtimeMs) newest = { mtimeMs, path: full };
      }
    }
  }
  return newest;
}

/**
 * Build freshness check for runs that don't go through turbo. A stale `dist/`
 * produced false failures during the spike, and the CLI banner reads the
 * version from package.json at runtime so it can't reveal a stale build.
 */
export default function setup() {
  // A prebuilt binary is the caller's choice; don't second-guess it.
  if (process.env.VERCEL_CLI_TEST_BINARY) return;
  // The wrapper's `vitest list` only counts test files; it never runs the CLI.
  if (process.env.TESTSERVER_LISTING === '1') return;

  const pkg = JSON.parse(
    readFileSync(join(cliRoot, 'package.json'), 'utf8')
  ) as { version: string };
  const versionFile = join(cliRoot, 'dist', 'version.mjs');
  const distVersion = existsSync(versionFile)
    ? /export const version = "(.+?)"/.exec(
        readFileSync(versionFile, 'utf8')
      )?.[1]
    : undefined;

  if (!distVersion || distVersion !== pkg.version) {
    throw new Error(
      `dist/ is missing or stale (dist ${distVersion ?? 'missing'}, package.json ${pkg.version}); run pnpm build in packages/cli`
    );
  }

  const distIndex = join(cliRoot, 'dist', 'index.js');
  if (!existsSync(distIndex)) {
    throw new Error('dist/index.js is missing; run pnpm build in packages/cli');
  }
  const builtAt = statSync(distIndex).mtimeMs;
  const newestSrc = newestMtime(join(cliRoot, 'src'));
  if (newestSrc.mtimeMs > builtAt) {
    console.warn(
      `[testserver] dist/ may be stale: ${newestSrc.path} is newer than dist/index.js; run pnpm build in packages/cli`
    );
  }
}
