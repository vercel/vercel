import { existsSync } from 'fs';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import readConfig from '../../../../src/util/config/read-config';

const originalArgv = process.argv;
let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'vc-read-config-'));
  // Compiling this fails, so only a read that skips it succeeds.
  await writeFile(join(cwd, 'vercel.ts'), 'export default {');
  await writeFile(
    join(cwd, 'vercel.dev.json'),
    JSON.stringify({ framework: 'nextjs' })
  );
});

afterEach(async () => {
  process.argv = originalArgv;
  await rm(cwd, { recursive: true, force: true });
});

describe('readConfig', () => {
  it('reads the --local-config file without compiling vercel.ts', async () => {
    process.argv = [
      'node',
      'vercel',
      'dev',
      '--local-config',
      join(cwd, 'vercel.dev.json'),
    ];

    expect(await readConfig(cwd)).toEqual({ framework: 'nextjs' });
    expect(existsSync(join(cwd, '.vercel', 'vercel.json'))).toBe(false);
  });

  it('compiles vercel.ts without --local-config', async () => {
    process.argv = ['node', 'vercel', 'dev'];

    expect(await readConfig(cwd)).toBeInstanceOf(Error);
  });
});
