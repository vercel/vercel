import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelemetryEventStore } from '../../../src/util/telemetry';
import { RootTelemetryClient } from '../../../src/util/telemetry/root';
import {
  getTelemetryReporter,
  setTelemetryReporter,
} from '../../../src/util/telemetry/reporter';
import { parseArguments } from '../../../src/util/get-args';
import getSubcommand from '../../../src/util/get-subcommand';
import getInvalidSubcommand from '../../../src/util/get-invalid-subcommand';

let telemetry: RootTelemetryClient;
let store: TelemetryEventStore;

beforeEach(() => {
  store = new TelemetryEventStore({ isDebug: true, config: {} });
  telemetry = new RootTelemetryClient({ opts: { store } });
});

afterEach(() => {
  vi.unstubAllEnvs();
  setTelemetryReporter(undefined);
});

const keys = () => store.readonlyEvents.map(e => e.key);

describe('trackError', () => {
  const apiError = () =>
    Object.assign(new Error('boom'), {
      status: 429,
      code: 'TOO_MANY_REQUESTS',
      slug: 'rate_limited',
      action: 'retry',
      serverMessage: 'Rate limited',
    });

  it('tracks structured fields for non-agents', () => {
    telemetry.trackError(apiError());
    expect(store.readonlyEvents).toMatchObject([
      { key: 'error_status', value: '429' },
      { key: 'error_code', value: 'TOO_MANY_REQUESTS' },
      { key: 'error_slug', value: 'rate_limited' },
      { key: 'error_action', value: 'retry' },
    ]);
  });

  it('adds server message for agents', () => {
    telemetry.trackError(apiError(), { agent: true });
    expect(keys()).toEqual([
      'error_status',
      'error_code',
      'error_slug',
      'error_action',
      'error_server_message',
    ]);
  });

  it('dedupes structured fields per error object', () => {
    const err = apiError();
    telemetry.trackError(err);
    telemetry.trackError(err, { agent: true });
    // second call only adds the agent-only server message
    expect(keys()).toEqual([
      'error_status',
      'error_code',
      'error_slug',
      'error_action',
      'error_server_message',
    ]);
  });
});

describe('parse errors', () => {
  it('tracks the literal only when it resembles a known flag', () => {
    setTelemetryReporter(telemetry);
    expect(() => parseArguments(['--pord'], { '--prod': Boolean })).toThrow();
    expect(store.readonlyEvents).toMatchObject([
      { key: 'parse_error', value: 'unknown_option:--pord' },
    ]);
  });

  it('redacts option names that resemble no known flag', () => {
    setTelemetryReporter(telemetry);
    expect(() =>
      parseArguments(['--sk-live-abc123'], { '--prod': Boolean })
    ).toThrow();
    expect(store.readonlyEvents[0]?.value).toBe('unknown_option:[REDACTED]');
  });

  it('does not throw without a reporter', () => {
    expect(getTelemetryReporter()).toBeUndefined();
    expect(() => parseArguments(['--pord'], {})).toThrow();
  });
});

describe('command_not_found', () => {
  it('tracks gated token and suggestion', () => {
    telemetry.trackCommandNotFound('deplyo', 'deploy');
    expect(store.readonlyEvents).toMatchObject([
      { key: 'command_not_found', value: 'deplyo' },
      { key: 'command_not_found_suggestion', value: 'deploy' },
    ]);
  });

  it('redacts any token without a suggestion (may be a directory name)', () => {
    telemetry.trackCommandNotFound('./secret-dir');
    telemetry.trackCommandNotFound('acme-internal-api');
    expect(store.readonlyEvents).toMatchObject([
      { key: 'command_not_found', value: '[REDACTED]' },
      { key: 'command_not_found_suggestion', value: 'NONE' },
      { key: 'command_not_found', value: '[REDACTED]' },
      { key: 'command_not_found_suggestion', value: 'NONE' },
    ]);
  });
});

describe('subcommand_not_found via getSubcommand + getInvalidSubcommand', () => {
  const config = { ls: ['ls', 'list'], add: ['add'], pull: ['pull'] };

  it('tracks the unknown token only when the dispatcher rejects it', () => {
    setTelemetryReporter(telemetry);
    getSubcommand(['pull-all'], config);
    expect(store.readonlyEvents).toHaveLength(0); // parked, not yet reported
    getInvalidSubcommand(config);
    expect(store.readonlyEvents).toMatchObject([
      { key: 'subcommand_not_found', value: 'pull-all' },
    ]);
  });

  it('redacts rejected tokens that resemble no valid subcommand', () => {
    setTelemetryReporter(telemetry);
    getSubcommand(['sk-live-abc123'], config);
    getInvalidSubcommand(config);
    expect(store.readonlyEvents).toMatchObject([
      { key: 'subcommand_not_found', value: '[REDACTED]' },
    ]);
  });

  it('tracks NONE when the dispatcher rejects with no token given', () => {
    setTelemetryReporter(telemetry);
    getSubcommand([], config);
    getInvalidSubcommand(config);
    expect(store.readonlyEvents).toMatchObject([
      { key: 'subcommand_not_found', value: 'NONE' },
    ]);
  });

  it('does not report implicit default actions (e.g. alias <src> <tgt>)', () => {
    setTelemetryReporter(telemetry);
    getSubcommand(['my-alias-source', 'my-target'], config);
    // dispatcher routes to its implicit action: getInvalidSubcommand never runs
    expect(store.readonlyEvents).toHaveLength(0);
  });

  it('does not leak a stale token into a later rejection', () => {
    setTelemetryReporter(telemetry);
    getSubcommand(['my-alias-source'], config); // parks a token
    getSubcommand(['ls'], config); // matched dispatch resets it
    getInvalidSubcommand(config);
    expect(store.readonlyEvents).toMatchObject([
      { key: 'subcommand_not_found', value: 'NONE' },
    ]);
  });
});

describe('trackCrash', () => {
  it('tracks error name and top frame basename', () => {
    const err = new TypeError('user-secret-message');
    err.stack = `TypeError: user-secret-message\n    at foo (/Users/someone/private/repo/dist/index.js:123:45)`;
    telemetry.trackCrash(err);
    expect(store.readonlyEvents).toMatchObject([
      { key: 'crash', value: 'TypeError:index.js:123' },
    ]);
    expect(store.readonlyEvents[0]?.value).not.toContain('secret');
  });

  it('falls back to unknown for missing stacks', () => {
    const err = new Error('x');
    err.stack = undefined;
    telemetry.trackCrash(err);
    expect(store.readonlyEvents[0]?.value).toBe('Error:unknown');
  });

  it('handles non-error values', () => {
    telemetry.trackCrash('string failure');
    expect(store.readonlyEvents[0]?.value).toBe('Error:unknown');
  });
});
