import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { installCliShim } from '../../../../src/commands/ship/cli-shim';

const run = promisify(execFile);

describe('ship cli shim', () => {
  let sessionDir: string;

  beforeEach(async () => {
    sessionDir = await mkdtemp(join(tmpdir(), 'ship-shim-test-'));
  });

  afterEach(async () => {
    await rm(sessionDir, { recursive: true, force: true });
  });

  it('writes executable vercel and vc shims that exec this entrypoint', async () => {
    const binDir = await installCliShim(sessionDir);
    if (process.platform === 'win32') {
      expect(binDir).toBeUndefined();
      return;
    }

    expect(binDir).toBe(join(sessionDir, 'bin'));
    for (const name of ['vercel', 'vc']) {
      const path = join(binDir!, name);
      const mode = (await stat(path)).mode;
      // Owner-executable.
      expect(mode & 0o100).toBeTruthy();
      const script = await readFile(path, 'utf-8');
      expect(script.startsWith('#!/bin/sh\n')).toBe(true);
      expect(script).toContain(process.execPath);
      expect(script).toContain('"$@"');
    }
  });

  it('produces a shim that actually executes the target', async () => {
    if (process.platform === 'win32') return;

    // Stand in for the CLI entrypoint with a script that proves pass-through.
    const entrypoint = join(sessionDir, 'entry.js');
    await writeFile(
      entrypoint,
      'console.log(JSON.stringify(process.argv.slice(2)));'
    );
    const originalArgv1 = process.argv[1];
    process.argv[1] = entrypoint;
    try {
      const binDir = await installCliShim(sessionDir);
      const { stdout } = await run(join(binDir!, 'vercel'), [
        'deploy',
        '--prod',
      ]);
      expect(JSON.parse(stdout)).toEqual(['deploy', '--prod']);
    } finally {
      process.argv[1] = originalArgv1;
    }
  });
});
