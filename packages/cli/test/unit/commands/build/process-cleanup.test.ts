import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import build from '../../../../src/commands/build';
import { BUILD_PROCESS_HANG_CHECK_ENV } from '../../../../src/util/build/build-process-hang-check';
import { client } from '../../../mocks/client';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { runBuildSubprocess } from '../../../helpers/run-build-subprocess';

vi.setConfig({ testTimeout: 3 * 60 * 1000 });

const fixture = (name: string) =>
  join(__dirname, '../../../fixtures/unit/commands/build', name);

/**
 * Regression tests for inc-6608: after `vercel build` finishes, the CLI must
 * either exit cleanly or fail with a clear error — not hang until timeout.
 *
 * Uses a local test builder that leaks a timer (same class of bug as builders
 * that leave the Node event loop active). No dependency on reverted
 * static-build vite logic.
 */
describe.skipIf(process.platform === 'win32')('build process cleanup', () => {
  beforeEach(() => {
    process.env[BUILD_PROCESS_HANG_CHECK_ENV] = '1';
  });

  afterEach(() => {
    delete process.env.__VERCEL_BUILD_RUNNING;
    delete process.env[BUILD_PROCESS_HANG_CHECK_ENV];
  });

  it('errors in-process when a builder leaves active timers', async () => {
    client.cwd = fixture('hanging-builder');
    client.setArgv('build', '--yes');

    const exitCode = await build(client);

    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput(
      'Error: Build completed but left active async resources'
    );
  });

  it('exits promptly in a subprocess with a non-zero code instead of hanging', async () => {
    const cwd = fixture('hanging-builder');

    const result = await runBuildSubprocess(cwd, {
      timeout: 30_000,
      args: ['build', '--yes'],
    });

    expect(result.timedOut).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      'Build completed but left active async resources'
    );
  });

  it('allows a normal build to complete and exit in a subprocess', async () => {
    const cwd = setupUnitFixture('commands/build/static');

    const result = await runBuildSubprocess(cwd, {
      timeout: 30_000,
      args: ['build', '--yes'],
    });

    expect(result.timedOut).toBe(false);
    expect(result.exitCode).toBe(0);
  });

  it('skips hang detection when the feature flag is disabled', async () => {
    delete process.env[BUILD_PROCESS_HANG_CHECK_ENV];
    client.cwd = fixture('hanging-builder');
    client.setArgv('build', '--yes');

    const exitCode = await build(client);

    expect(exitCode).toBe(0);
  });
});
