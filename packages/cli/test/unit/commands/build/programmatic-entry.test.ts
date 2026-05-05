import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import { join } from 'path';
import { getWriteableDirectory } from '@vercel/build-utils';
import { runBuildWithInput } from '../../../../src/commands/build';
import { client } from '../../../mocks/client';

vi.setConfig({ testTimeout: 6 * 60 * 1000 });

const fixture = (name: string) =>
  join(__dirname, '../../../fixtures/unit/commands/build', name);

let outputDir: string | undefined;

function getStringProcessEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }
  return env;
}

describe('programmatic build entrypoint', () => {
  beforeEach(() => {
    delete process.env.__VERCEL_BUILD_RUNNING;
    delete process.env.PROGRAMMATIC_ONLY;
    delete process.env.VERCEL_TRACING_DISABLE_AUTOMATIC_FETCH_INSTRUMENTATION;
  });

  afterEach(async () => {
    if (outputDir) {
      await fs.remove(outputDir);
      outputDir = undefined;
    }
  });

  it('builds through the shared build command implementation', async () => {
    const cwd = fixture('env-from-vc-pull');
    outputDir = join(await getWriteableDirectory(), 'programmatic-output');
    const argv = [process.execPath, 'cli.js', 'build', '--output', outputDir];
    const originalCwd = process.cwd();
    const originalClientCwd = client.cwd;
    const originalClientArgv = client.argv;

    const exitCode = await runBuildWithInput(client, {
      argv,
      cwd,
      env: {
        ...getStringProcessEnv(),
        PROGRAMMATIC_ONLY: '1',
      },
    });

    expect(exitCode).toEqual(0);
    expect(process.cwd()).toEqual(originalCwd);
    expect(client.cwd).toEqual(originalClientCwd);
    expect(client.argv).toEqual(originalClientArgv);
    expect(process.env.PROGRAMMATIC_ONLY).toBeUndefined();

    const env = await fs.readJSON(join(outputDir, 'static', 'env.json'));
    expect(env['ENV_FILE']).toEqual('preview');
    expect(env['PROGRAMMATIC_ONLY']).toEqual('1');

    const builds = await fs.readJSON(join(outputDir, 'builds.json'));
    expect(builds.argv).toEqual(argv);
  });

  it('restores process state after failures', async () => {
    const originalCwd = process.cwd();
    const originalClientCwd = client.cwd;
    const originalClientArgv = client.argv;

    await expect(
      runBuildWithInput(client, {
        argv: [process.execPath, 'cli.js', 'build'],
        cwd: join(fixture('env-from-vc-pull'), 'missing'),
        env: {
          ...getStringProcessEnv(),
          PROGRAMMATIC_ONLY: '1',
        },
      })
    ).rejects.toThrow();

    expect(process.cwd()).toEqual(originalCwd);
    expect(client.cwd).toEqual(originalClientCwd);
    expect(client.argv).toEqual(originalClientArgv);
    expect(process.env.PROGRAMMATIC_ONLY).toBeUndefined();
  });
});
