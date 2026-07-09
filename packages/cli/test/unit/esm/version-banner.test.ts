import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('vc.js version banner', () => {
  it('labels native binary installs on stderr while preserving stdout semver', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vc-version-banner-'));
    await copyFile('src/vc.js', join(dir, 'vc.js'));
    await writeFile(
      join(dir, 'version.mjs'),
      'export const version = "1.2.3";\n'
    );

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [join(dir, 'vc.js'), '--version'],
      {
        env: {
          ...process.env,
          VERCEL_VC_NATIVE: '1',
        },
      }
    );

    expect(stdout.trim()).toBe('1.2.3');
    expect(stderr.trim()).toBe('Vercel CLI 1.2.3 (native)');
  });
});
