import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  buildLocally,
  shouldBuildLocally,
} from '../../../../scripts/testserver/build-locally.mjs';
import { BUILD_FAILED, BUILD_OK, fakeLauncher } from './fixture';

describe('shouldBuildLocally()', () => {
  test('builds for a local run on a dev machine', () => {
    expect(shouldBuildLocally({})).toBe(true);
    expect(shouldBuildLocally({ TESTSERVER_RUNNER: 'local' })).toBe(true);
  });

  test('skips under CI, where the workflow builds', () => {
    expect(shouldBuildLocally({ CI: '1' })).toBe(false);
  });

  test('skips with VERCEL_CLI_TEST_BINARY, which tests a binary', () => {
    expect(
      shouldBuildLocally({ VERCEL_CLI_TEST_BINARY: '/tmp/vercel-darwin-arm64' })
    ).toBe(false);
  });
});

describe('buildLocally()', () => {
  let logs: string[];
  beforeEach(() => {
    logs = [];
    vi.spyOn(console, 'error').mockImplementation((line: string) => {
      logs.push(line);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("launches pnpm through execa, so Windows pnpm.cmd shims work, and returns the build's ms", async () => {
    const { run } = fakeLauncher(BUILD_OK);

    await expect(buildLocally('/repo', { run })).resolves.toBeTypeOf('number');
    expect(run).toHaveBeenCalledWith(
      'pnpm',
      [
        'exec',
        'turbo',
        '--no-update-notifier',
        'run',
        'build:package',
        '--filter=vercel',
      ],
      { cwd: '/repo', stdio: 'inherit', reject: false }
    );
    expect(logs).toEqual([
      '[testserver] Building the CLI on this machine: turbo run build:package --filter=vercel',
    ]);
  });

  test('throws with what failed instead of exiting the process', async () => {
    const exit = vi.spyOn(process, 'exit');
    const { run } = fakeLauncher(BUILD_FAILED);

    await expect(buildLocally('/repo', { run })).rejects.toThrow(
      `Building the CLI on this machine failed, so not running the tests: ${BUILD_FAILED.message}`
    );
    expect(exit).not.toHaveBeenCalled();
  });

  test('throws when pnpm cannot start', async () => {
    const { run } = fakeLauncher({
      failed: true,
      message: 'Command failed with ENOENT: pnpm exec turbo\nspawn pnpm ENOENT',
    });

    await expect(buildLocally('/repo', { run })).rejects.toThrow(
      'Building the CLI on this machine failed, so not running the tests: Command failed with ENOENT: pnpm exec turbo\nspawn pnpm ENOENT'
    );
  });

  test('rejects with the abort reason after stopping the build', async () => {
    const { run, kill } = fakeLauncher();
    const controller = new AbortController();
    const result = buildLocally('/repo', { run, signal: controller.signal });
    controller.abort();

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(kill).toHaveBeenCalledWith('SIGTERM');
  });

  test('stops the build at once when its signal already aborted', async () => {
    const { run, kill } = fakeLauncher();

    await expect(
      buildLocally('/repo', { run, signal: AbortSignal.abort() })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(kill).toHaveBeenCalledTimes(1);
  });
});
