import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import {
  parsePnpmVersion,
  parseWorkspacePattern,
  parseWorkspacePatterns,
  workspacePatterns,
} from '../../../../scripts/testserver/files.mjs';
import { makeRunnerRepo } from './fixture';

describe('parseWorkspacePatterns()', () => {
  test('reads the packages list', () => {
    expect(
      parseWorkspacePatterns(
        [
          'packages:',
          "  - 'packages/*'",
          '  - "api"',
          '  # comment',
          '  - internals/*',
          '',
          'minimumReleaseAge: 2880',
          'minimumReleaseAgeExclude:',
          "  - '@vercel/*'",
        ].join('\n')
      )
    ).toEqual(['packages/*', 'api', 'internals/*']);
  });
});

describe('parseWorkspacePattern()', () => {
  test('reads a directory or a parent/* pattern, negated or not', () => {
    expect(parseWorkspacePattern('api')).toEqual({
      negated: false,
      dir: 'api',
    });
    expect(parseWorkspacePattern('packages/*/')).toEqual({
      negated: false,
      parent: 'packages',
    });
    expect(parseWorkspacePattern('!packages/excluded')).toEqual({
      negated: true,
      dir: 'packages/excluded',
    });
  });

  test.each([
    ['./api/', { negated: false, dir: 'api' }],
    ['./packages/*/', { negated: false, parent: 'packages' }],
    ['!./packages/excluded', { negated: true, dir: 'packages/excluded' }],
    ['!./packages/*', { negated: true, parent: 'packages' }],
    ['./packages//./*', { negated: false, parent: 'packages' }],
    ['./packages//*', { negated: false, parent: 'packages' }],
  ])('normalizes %s to Git-relative directories', (pattern, expected) => {
    expect(parseWorkspacePattern(pattern)).toEqual(expected);
  });

  test('rejects other globs', () => {
    expect(() => parseWorkspacePattern('packages/**')).toThrow(
      /Unsupported pnpm-workspace.yaml pattern `packages\/\*\*`/
    );
  });
});

describe('workspacePatterns()', () => {
  let root: string;

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("reads the repo's pnpm-workspace.yaml, or none without one", () => {
    root = makeRunnerRepo();
    expect(workspacePatterns(root)).toEqual(['packages/*', 'api', 'missing']);
    rmSync(join(root, 'pnpm-workspace.yaml'));
    expect(workspacePatterns(root)).toEqual([]);
  });
});

describe('parsePnpmVersion()', () => {
  test('reads packageManager', () => {
    expect(
      parsePnpmVersion('{"packageManager":"pnpm@10.29.3+sha512.abc"}')
    ).toBe('10.29.3');
    expect(() => parsePnpmVersion('{}')).toThrow(/packageManager/);
  });
});

describe('createTarball()', () => {
  const filesUrl = pathToFileURL(
    resolve(__dirname, '../../../../scripts/testserver/files.mjs')
  ).href;
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  // Runs createTarball in its own process, so a crash from an unhandled
  // stream error shows up as the exit code instead of taking down the test
  // runner. Prints the rejection message, or the tarball size.
  function runCreateTarball(tar: string, pathCount: number) {
    const script = `
      import { createTarball } from ${JSON.stringify(filesUrl)};
      const paths = Array.from({ length: ${pathCount} }, (_, i) => 'f' + i);
      try {
        const tarball = await createTarball(${JSON.stringify(dir)}, paths, ${JSON.stringify(tar)});
        console.log('resolved ' + tarball.length);
      } catch (err) {
        console.log('rejected ' + err.name + ': ' + err.message);
      }
    `;
    return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
    });
  }

  // The fake tars below are `#!/bin/sh` scripts, which Windows can't spawn.
  const posixOnly = test.skipIf(process.platform === 'win32');

  posixOnly(
    'rejects instead of crashing when tar exits without reading its input',
    () => {
      dir = mkdtempSync(join(tmpdir(), 'runner-tar-'));
      // A tar that closes stdin and fails before reading the path list. Writing
      // ~4 MB of paths to it fails with EPIPE.
      const fakeTar = join(dir, 'fake-tar');
      writeFileSync(
        fakeTar,
        '#!/bin/sh\nexec 0<&-\necho "tar: cannot open" >&2\nsleep 0.05\nexit 2\n'
      );
      chmodSync(fakeTar, 0o755);

      const result = runCreateTarball(fakeTar, 500_000);
      expect(result.stderr).not.toContain('EPIPE');
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe(
        'rejected RunnerError: tar failed (exit 2): tar: cannot open'
      );
    }
  );

  posixOnly('rejects when tar exits 0 without reading every path', () => {
    dir = mkdtempSync(join(tmpdir(), 'runner-tar-'));
    // Succeeding without the full path list would make an incomplete tarball.
    const fakeTar = join(dir, 'fake-tar');
    writeFileSync(fakeTar, '#!/bin/sh\nexec 0<&-\nsleep 0.05\nexit 0\n');
    chmodSync(fakeTar, 0o755);

    const result = runCreateTarball(fakeTar, 500_000);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toMatch(
      /^rejected RunnerError: tar did not read the whole path list: .*EPIPE/
    );
  });

  test('packs the given paths with the system tar', () => {
    dir = mkdtempSync(join(tmpdir(), 'runner-tar-'));
    writeFileSync(join(dir, 'f0'), 'hello');
    const result = runCreateTarball('tar', 1);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toMatch(/^resolved [1-9]\d*$/);
  });
});
