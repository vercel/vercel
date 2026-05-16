import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('vc.js punycode warnings', () => {
  let fixtureDir: string | undefined;

  afterEach(async () => {
    if (fixtureDir) {
      await rm(fixtureDir, { recursive: true, force: true });
      fixtureDir = undefined;
    }
  });

  it('silences DEP0040 warnings emitted while loading the CLI', async () => {
    fixtureDir = await mkdtemp(join(tmpdir(), 'vercel-cli-punycode-'));
    const vcSource = await readFile(
      join(__dirname, '../../../src/vc.js'),
      'utf8'
    );

    await writeFile(
      join(fixtureDir, 'package.json'),
      JSON.stringify({ type: 'module' })
    );
    await writeFile(join(fixtureDir, 'vc.js'), vcSource);
    await writeFile(
      join(fixtureDir, 'index.js'),
      [
        "process.emitWarning('The `punycode` module is deprecated. Please use a userland alternative instead.', {",
        "  type: 'DeprecationWarning',",
        "  code: 'DEP0040',",
        '});',
        "process.emitWarning('keep this warning', {",
        "  type: 'Warning',",
        "  code: 'KEEP',",
        '});',
        'await new Promise(resolve => setImmediate(resolve));',
      ].join('\n')
    );

    const { stderr } = await execFileAsync(
      process.execPath,
      [join(fixtureDir, 'vc.js'), 'build'],
      { cwd: fixtureDir }
    );

    expect(stderr).not.toContain('[DEP0040]');
    expect(stderr).not.toContain('punycode');
    expect(stderr).toContain('[KEEP]');
    expect(stderr).toContain('keep this warning');
  });
});
