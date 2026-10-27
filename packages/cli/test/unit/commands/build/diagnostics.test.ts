import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWriteableDirectory } from '@vercel/build-utils';
import build from '../../../../src/commands/build';
import { client } from '../../../mocks/client';
import { runAsAgent } from '../../../helpers/run-as-agent';

const errorCodes = () =>
  client.telemetryEventStore.readonlyEvents
    .filter(event => event.key === 'error_code')
    .map(event => event.value);

describe('build diagnostic reporting', () => {
  beforeEach(async () => {
    delete process.env.__VERCEL_BUILD_RUNNING;
    client.cwd = await getWriteableDirectory();
    client.setArgv('build');
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('unexpected exit');
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([
    ['recursion', 'BUILD_RECURSIVE_INVOCATION', 'Build Command', 1],
    ['argument', 'ARG_UNKNOWN_OPTION', 'Did you mean --output?', 2],
  ])('reports %s with recovery and one code event', async (kind, code, recovery, exitCode) => {
    if (kind === 'recursion') process.env.__VERCEL_BUILD_RUNNING = '1';
    else client.setArgv('build', '--ouput');
    expect(await build(client)).toBe(exitCode);
    expect(client.stderr.getFullOutput()).toContain(`[${code}]`);
    expect(client.stderr.getFullOutput()).toContain(recovery);
    expect(errorCodes()).toEqual([code]);
  });

  it('records missing settings without exiting before telemetry can flush', async () => {
    client.nonInteractive = true;
    expect(await build(client)).toBe(1);
    expect(process.exit).not.toHaveBeenCalled();
    expect(errorCodes()).toEqual(['BUILD_PROJECT_SETTINGS_REQUIRED']);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'project_settings_required',
    });
  });

  it.each([
    ['recursion', 'BUILD_RECURSIVE_INVOCATION'],
    ['missing settings', 'project_settings_required'],
  ])('sends one code for an agent run with %s', async (kind, code) => {
    if (kind === 'recursion') process.env.__VERCEL_BUILD_RUNNING = '1';
    else client.nonInteractive = true;
    expect(await runAsAgent(() => build(client))).toBe(1);
    expect(process.exit).not.toHaveBeenCalled();
    expect(errorCodes()).toEqual([code]);
  });
});
