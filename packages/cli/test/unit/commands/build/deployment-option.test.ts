import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWriteableDirectory } from '@vercel/build-utils';
import build from '../../../../src/commands/build';
import { client } from '../../../mocks/client';

function optionEvents() {
  return client.telemetryEventStore.readonlyEvents
    .map(event => event.key)
    .filter(key => key === 'option:deployment' || key === 'option:id');
}

describe('build --deployment', () => {
  beforeEach(async () => {
    delete process.env.__VERCEL_BUILD_RUNNING;
    client.cwd = await getWriteableDirectory();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects --deployment with its deprecated name --id before any request', async () => {
    const fetch = vi.spyOn(client, 'fetch');
    client.setArgv('build', '--deployment', 'dpl_a', '--id', 'dpl_b');

    expect(await build(client)).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      "Can't use --deployment with --id."
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects an empty --deployment instead of building with local variables', async () => {
    const fetch = vi.spyOn(client, 'fetch');
    client.setArgv('build', '--deployment=');

    expect(await build(client)).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      "--deployment can't be empty."
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(
      client.telemetryEventStore.readonlyEvents
        .filter(event => event.key === 'error_code')
        .map(event => event.value)
    ).toEqual(['invalid_arguments']);
  });

  it('keeps ignoring an empty deprecated --id', async () => {
    client.nonInteractive = true;
    client.setArgv('build', '--id=');

    // Not a usage error: the build goes on and stops at the missing settings.
    expect(await build(client)).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      reason: 'project_settings_required',
    });
  });

  it('writes a JSON error for --deployment with --id in non-interactive mode', async () => {
    client.nonInteractive = true;
    client.setArgv('build', '--deployment', 'dpl_a', '--id', 'dpl_b');

    expect(await build(client)).toBe(2);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
      message: "Can't use --deployment with --id.",
    });
  });

  // Without project settings the build stops early, after reading its options.
  it.each([
    ['--deployment', 'option:deployment', false],
    ['--id', 'option:id', true],
  ] as const)('records %s under its own name', async (flag, event, warns) => {
    client.nonInteractive = true;
    client.setArgv('build', flag, 'dpl_a');

    expect(await build(client)).toBe(1);
    expect(optionEvents()).toEqual([event]);
    expect(client.stderr.getFullOutput().includes('deprecated')).toBe(warns);
  });
});
