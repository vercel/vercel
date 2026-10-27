import type { TraceEvent } from '@vercel/build-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getStartupDurationMs,
  toCommandTrace,
} from '../../../src/util/telemetry/command-trace';
import { TelemetryEventStore } from '../../../src/util/telemetry';
import {
  recordCliError,
  takeCliError,
} from '../../../src/util/telemetry/cli-error';

vi.mock('node:child_process', async importOriginal => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: vi.fn(),
}));

const event: TraceEvent = {
  id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
  parentId: 'private-parent',
  name: 'vc.cli.command',
  timestamp: 0,
  startTime: 1_700_000_000_000,
  duration: 123_456,
  tags: { command: 'ls', path: '/private/project' },
};

const context = {
  command: 'list',
  invocationId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  cliVersion: '64.5.0',
  releaseChannel: 'stable',
  isAgent: false,
  exitCode: 0,
  completion: 'completed' as const,
};

afterEach(() => {
  takeCliError();
  Reflect.deleteProperty(globalThis, Symbol.for('vercel.cli.entry-at'));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('toCommandTrace', () => {
  it('keeps the span timing and replaces its local tags', () => {
    expect(toCommandTrace(event, context)).toEqual({
      id: event.id,
      name: 'vc.cli.command',
      timestamp: event.timestamp,
      startTime: event.startTime,
      duration: event.duration,
      tags: expect.objectContaining({
        command: 'list',
        invocation_id: context.invocationId,
        cli_version: '64.5.0',
        release_channel: 'stable',
        platform: process.platform,
        arch: process.arch,
        is_agent: 'false',
        exit_code: '0',
        completion: 'completed',
        outcome: 'success',
      }),
    });
    expect(JSON.stringify(toCommandTrace(event, context))).not.toMatch(
      /private/
    );
  });

  it.each([
    [0, 'completed', 'success'],
    [2, 'completed', 'failure'],
    [130, 'completed', 'canceled'],
    [0, 'process_exit', 'unknown'],
    [1, 'process_exit', 'failure'],
  ] as const)('records exit code %i (%s) as %s', (exitCode, completion, outcome) => {
    expect(
      toCommandTrace(event, { ...context, exitCode, completion }).tags
    ).toMatchObject({ exit_code: String(exitCode), completion, outcome });
  });

  it.each([
    ['codex', 'codex'],
    ['Claude Code', undefined],
  ])('includes agent name %j only when the bridge accepts it', (agentName, expected) => {
    const { tags } = toCommandTrace(event, {
      ...context,
      isAgent: true,
      agentName,
    });
    expect(tags.agent_name).toBe(expected);
  });
});

describe('command failure cause', () => {
  const failure = { ...context, exitCode: 1 };

  it.each([
    [0, 'completed'],
    [130, 'completed'],
    [0, 'process_exit'],
  ] as const)('leaves the error off for exit code %i (%s)', (exitCode, completion) => {
    recordCliError({ code: 'not_found' });
    expect(
      toCommandTrace(event, { ...context, exitCode, completion }).tags
    ).not.toHaveProperty('error_code');
  });

  it('records the error code without consuming it', () => {
    const details = { code: 'not_found', status: 404 };
    recordCliError(details);

    expect(
      toCommandTrace(event, { ...failure, completion: 'process_exit' }).tags
    ).toMatchObject({ error_code: 'not_found', error_source: 'recorded' });
    expect(takeCliError()).toBe(details);
  });

  it('marks errors caught by the top-level handler', () => {
    recordCliError({ code: 'ARG_UNKNOWN_OPTION' });
    expect(
      toCommandTrace(event, { ...failure, errorSource: 'caught' }).tags
    ).toMatchObject({
      error_code: 'ARG_UNKNOWN_OPTION',
      error_source: 'caught',
    });
  });

  it('falls back to UNCLASSIFIED_ERROR when nothing was recorded', () => {
    expect(toCommandTrace(event, failure).tags).toMatchObject({
      error_code: 'UNCLASSIFIED_ERROR',
      error_source: 'unknown',
    });
  });

  it.each([
    ['A'.repeat(80), 'A'.repeat(80)],
    ['A'.repeat(81), 'UNCLASSIFIED_ERROR'],
    ['https://private.example/token', 'UNCLASSIFIED_ERROR'],
    ['ARG_UNKNOWN_OPTION', 'ARG_UNKNOWN_OPTION'],
    ['not_found', 'not_found'],
    ['TypeError', 'TypeError'],
    ['zcode-quit-before-setup', 'zcode-quit-before-setup'],
    ['DOMException', 'DOMException'],
    ['has space', 'UNCLASSIFIED_ERROR'],
  ])('bounds the recorded error code %s', (code, expected) => {
    recordCliError({
      code,
      slug: '/private/project',
      serverMessage: 'private',
    });
    const trace = toCommandTrace(event, failure);
    expect(trace.tags.error_code).toBe(expected);
    expect(JSON.stringify(trace)).not.toMatch(
      /private\.example|\/private\/project/
    );
  });
});

describe('startup duration', () => {
  it('measures from CLI entry and excludes time spent waiting on the user', () => {
    Reflect.set(globalThis, Symbol.for('vercel.cli.entry-at'), 100);
    vi.spyOn(performance, 'now').mockReturnValue(5_125.5);

    const startupDurationMs = getStartupDurationMs(5_000);

    expect(startupDurationMs).toBe(25.5);
    expect(
      toCommandTrace(event, { ...context, startupDurationMs }).tags
        .startup_duration_ms
    ).toBe('25.500');
  });

  it('is left off when the CLI entry time is unknown', () => {
    expect(getStartupDurationMs()).toBeUndefined();
    expect(toCommandTrace(event, context).tags).not.toHaveProperty(
      'startup_duration_ms'
    );
  });
});

describe('command trace handoff', () => {
  it('hands the trace to the worker without sending it from the parent', async () => {
    vi.stubEnv('VERCEL_TELEMETRY_DISABLED', undefined);
    const store = new TelemetryEventStore({ config: { enabled: true } });
    store.add({ id: 'usage', eventTime: 1, key: 'command:ls', value: 'ls' });
    const send = vi.spyOn(store, 'sendToSubprocess').mockResolvedValue();
    const request = vi.spyOn(globalThis, 'fetch');
    const trace = toCommandTrace(event, context);

    store.setCommandTrace(trace, 'preview-build');
    await store.save();

    const handoff = JSON.parse(JSON.stringify(send.mock.calls[0][0]));
    expect(handoff.commandTrace).toEqual({
      event: trace,
      buildLabel: 'preview-build',
    });
    expect(handoff.body).toHaveLength(1);
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    'environment-optout',
    'config-optout',
    'telemetry-debug',
  ])('does not hand off a trace for %s', async mode => {
    vi.stubEnv(
      'VERCEL_TELEMETRY_DISABLED',
      mode === 'environment-optout' ? '1' : undefined
    );
    const store = new TelemetryEventStore({
      config: { enabled: mode !== 'config-optout' },
      isDebug: mode === 'telemetry-debug',
    });
    store.add({ id: 'usage', eventTime: 1, key: 'platform', value: 'darwin' });
    const send = vi.spyOn(store, 'sendToSubprocess').mockResolvedValue();
    store.setCommandTrace(toCommandTrace(event, context));
    await store.save();
    expect(send).not.toHaveBeenCalled();
  });
});
