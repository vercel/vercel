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

  it('warns when there is no functions, static, or services directory', async () => {
    const dir = await makeTempDir();
    created.push(dir);

    await fs.writeJSON(join(dir, 'config.json'), { version: 3 });

    const problems = await validateBuildOutput(dir);
    expect(problems).toContainEqual({
      severity: 'warning',
      message:
        'Build output contains no "functions", "static", or "services" directory; the build may not have produced any deployable output.',
    });
  });

  it('returns no problems for a services-only build', async () => {
    const dir = await makeTempDir();
    created.push(dir);

    await fs.writeJSON(join(dir, 'config.json'), { version: 3 });
    await fs.ensureDir(join(dir, 'services', 'api'));
    await fs.writeJSON(join(dir, 'services', 'api', 'config.json'), {
      version: 3,
    });
    await fs.ensureDir(join(dir, 'services', 'api', 'static'));

    const problems = await validateBuildOutput(dir);
    expect(problems).toEqual([]);
  });

  it('returns an error when a service is missing config.json', async () => {
    const dir = await makeTempDir();
    created.push(dir);

    await fs.writeJSON(join(dir, 'config.json'), { version: 3 });
    await fs.ensureDir(join(dir, 'services', 'api', 'static'));

    const problems = await validateBuildOutput(dir);
    expect(problems).toContainEqual({
      severity: 'error',
      message: 'Build output service "api" is missing config.json.',
    });
  });

  it('warns on an unexpected service config version', async () => {
    const dir = await makeTempDir();
    created.push(dir);

    await fs.writeJSON(join(dir, 'config.json'), { version: 3 });
    await fs.ensureDir(join(dir, 'services', 'api'));
    await fs.writeJSON(join(dir, 'services', 'api', 'config.json'), {
      version: 2,
    });
    await fs.ensureDir(join(dir, 'services', 'api', 'static'));

    const problems = await validateBuildOutput(dir);
    expect(problems).toContainEqual({
      severity: 'warning',
      message:
        'Build output service "api" config.json has unexpected version "2" (expected 3).',
    });
  });

  it('returns an error when a service config.json is invalid JSON', async () => {
    const dir = await makeTempDir();
    created.push(dir);

    await fs.writeJSON(join(dir, 'config.json'), { version: 3 });
    await fs.ensureDir(join(dir, 'services', 'api'));
    await fs.writeFile(
      join(dir, 'services', 'api', 'config.json'),
      '{ not json'
    );
    await fs.ensureDir(join(dir, 'services', 'api', 'static'));

    const problems = await validateBuildOutput(dir);
    expect(problems).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining(
          'Build output service "api" config.json is not valid JSON:'
        ),
      })
    );
  });

  it('validates multiple services independently', async () => {
    const dir = await makeTempDir();
    created.push(dir);

    await fs.writeJSON(join(dir, 'config.json'), { version: 3 });
    await fs.ensureDir(join(dir, 'services', 'api'));
    await fs.writeJSON(join(dir, 'services', 'api', 'config.json'), {
      version: 3,
    });
    await fs.ensureDir(join(dir, 'services', 'api', 'static'));
    await fs.ensureDir(join(dir, 'services', 'web'));
    await fs.writeJSON(join(dir, 'services', 'web', 'config.json'), {
      version: 2,
    });
    await fs.ensureDir(join(dir, 'services', 'web', 'static'));

    const problems = await validateBuildOutput(dir);
    const versionWarnings = problems.filter(p =>
      p.message.includes('unexpected version')
    );
    expect(versionWarnings).toEqual([
      {
        severity: 'warning',
        message:
          'Build output service "web" config.json has unexpected version "2" (expected 3).',
      },
    ]);
  });

  it('warns when a service has no functions or static directory', async () => {
    const dir = await makeTempDir();
    created.push(dir);

    await fs.writeJSON(join(dir, 'config.json'), { version: 3 });
    await fs.ensureDir(join(dir, 'services', 'api'));
    await fs.writeJSON(join(dir, 'services', 'api', 'config.json'), {
      version: 3,
    });
    await fs.ensureDir(join(dir, 'services', 'api', 'routes'));

    const problems = await validateBuildOutput(dir);
    expect(problems).toContainEqual({
      severity: 'warning',
      message:
        'Build output service "api" contains no "functions" or "static" directory; the service may not have produced any deployable output.',
    });
  });

  it('ignores non-directory entries under services', async () => {
    const dir = await makeTempDir();
    created.push(dir);

    await fs.writeJSON(join(dir, 'config.json'), { version: 3 });
    await fs.ensureDir(join(dir, 'services', 'api'));
    await fs.writeJSON(join(dir, 'services', 'api', 'config.json'), {
      version: 3,
    });
    await fs.ensureDir(join(dir, 'services', 'api', 'static'));
    await fs.writeFile(join(dir, 'services', 'readme.txt'), 'hello');

    const problems = await validateBuildOutput(dir);
    expect(problems).toEqual([]);
  });
});
