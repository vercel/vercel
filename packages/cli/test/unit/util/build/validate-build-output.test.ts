import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import { tmpdir } from 'os';
import { join } from 'path';
import { validateBuildOutput } from '../../../../src/util/build/validate-build-output';

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(join(tmpdir(), 'validate-build-output-'));
}

describe('validateBuildOutput()', () => {
  const created: string[] = [];

  afterEach(async () => {
    while (created.length) {
      const dir = created.pop();
      if (dir) {
        await fs.remove(dir);
      }
    }
  });

  it('returns an error when config.json is missing', async () => {
    const dir = await makeTempDir();
    created.push(dir);

    const problems = await validateBuildOutput(dir);
    expect(problems).toContainEqual({
      severity: 'error',
      message: 'Build output is missing config.json.',
    });
  });

  it('returns no problems for a valid v3 config with a static dir', async () => {
    const dir = await makeTempDir();
    created.push(dir);

    await fs.writeJSON(join(dir, 'config.json'), { version: 3 });
    await fs.ensureDir(join(dir, 'static'));

    const problems = await validateBuildOutput(dir);
    expect(problems).toEqual([]);
  });

  it('warns on an unexpected config version', async () => {
    const dir = await makeTempDir();
    created.push(dir);

    await fs.writeJSON(join(dir, 'config.json'), { version: 2 });
    await fs.ensureDir(join(dir, 'static'));

    const problems = await validateBuildOutput(dir);
    expect(problems).toContainEqual({
      severity: 'warning',
      message:
        'Build output config.json has unexpected version "2" (expected 3).',
    });
  });

  it('warns when there is no functions or static directory', async () => {
    const dir = await makeTempDir();
    created.push(dir);

    await fs.writeJSON(join(dir, 'config.json'), { version: 3 });

    const problems = await validateBuildOutput(dir);
    expect(problems).toContainEqual({
      severity: 'warning',
      message:
        'Build output contains no "functions" or "static" directory; the build may not have produced any deployable output.',
    });
  });
});
