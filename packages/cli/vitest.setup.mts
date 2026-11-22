import { mkdirSync, mkdtempSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { afterAll, beforeAll, inject, vi } from 'vitest';
import { getDataPath, getGlobalPathConfig } from '@vercel/cli-config';
import output from './src/output-manager';
import { removeIsolatedDir } from './test/helpers/remove-isolated-dir';

// Unit, e2e and integration tests must never touch the developer's real
// Vercel CLI global config (auth.json, config.json) or OS keychain. Redirect
// the XDG data and cache dirs to a fresh temp dir per test file, under the
// run-wide root created by `vitest.global-setup.mts`. This runs at module
// evaluation time so it precedes the test file's own imports, and child
// processes spawned by tests inherit the redirected env.
//
// The env is assigned directly, as many unit and integration tests already
// do. The static `test.env` config option cannot hold a per-file temp path,
// and nothing restores these values, so `vi.stubEnv` adds nothing here.
const isolatedRoot = mkdtempSync(join(inject('vercelCliTestRoot'), 'file-'));
process.env.XDG_DATA_HOME = join(isolatedRoot, 'data');
process.env.XDG_CACHE_HOME = join(isolatedRoot, 'cache');
// Without an env override, credential storage defaults to `file`. File storage
// still tries to clear stale keyring entries, so disable native keyring loading
// in this process and every child process.
delete process.env.VERCEL_TOKEN_STORAGE;
process.env.VERCEL_TEST_KEYRING_UNAVAILABLE = '1';
// Create the data dir up front: getGlobalPathConfig() falls back to a real
// ~/.now or legacy directory when the first candidate does not exist.
mkdirSync(getDataPath(), { recursive: true });

const resolvedGlobalDir = getGlobalPathConfig();
const relativeGlobalDir = relative(isolatedRoot, resolvedGlobalDir);
if (relativeGlobalDir.startsWith('..') || isAbsolute(relativeGlobalDir)) {
  throw new Error(
    `Test global config dir ${resolvedGlobalDir} escaped the isolated root ${isolatedRoot}`
  );
}

// Free disk space early; the global setup teardown removes anything left over.
afterAll(() => {
  removeIsolatedDir(isolatedRoot);
});

beforeAll(() => {
  output.initialize({
    supportsHyperlink: false,
    noColor: true,
  });
});

if (process.debugPort) {
  // when debugging in an IDE, set a high timeout
  vi.setConfig({ testTimeout: 10 * 60 * 1000 });
}

// Saved team names are written to the global config. Mocking the writes keeps
// mock teams from leaking state between tests within a file;
// `team-name-cache.test.ts` unmocks this to test the real module.
vi.mock('./src/util/teams/team-name-cache', async importOriginal => ({
  ...(await importOriginal<
    typeof import('./src/util/teams/team-name-cache')
  >()),
  setCachedTeamSlug: vi.fn(),
  forgetCachedTeamSlug: vi.fn(),
}));
