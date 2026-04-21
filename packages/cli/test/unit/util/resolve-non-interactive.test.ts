import { describe, expect, it } from 'vitest';
import {
  parseBooleanEnv,
  resolveNonInteractive,
} from '../../../src/util/resolve-non-interactive';

describe('parseBooleanEnv', () => {
  it('parses truthy env values', () => {
    expect(parseBooleanEnv('1')).toBe(true);
    expect(parseBooleanEnv('true')).toBe(true);
    expect(parseBooleanEnv('YES')).toBe(true);
    expect(parseBooleanEnv('on')).toBe(true);
  });

  it('parses falsy env values', () => {
    expect(parseBooleanEnv('0')).toBe(false);
    expect(parseBooleanEnv('false')).toBe(false);
    expect(parseBooleanEnv('No')).toBe(false);
    expect(parseBooleanEnv('off')).toBe(false);
  });

  it('returns undefined for invalid values', () => {
    expect(parseBooleanEnv(undefined)).toBeUndefined();
    expect(parseBooleanEnv('')).toBeUndefined();
    expect(parseBooleanEnv('maybe')).toBeUndefined();
  });
});

describe('resolveNonInteractive', () => {
  it('uses VERCEL_NON_INTERACTIVE when valid', () => {
    expect(
      resolveNonInteractive({
        envValue: 'true',
        cliFlag: false,
        explicitCliFalse: false,
        isAgent: false,
        stdinIsTTY: true,
      })
    ).toEqual({
      nonInteractive: true,
      fromEnv: true,
      parsedEnv: true,
    });

    expect(
      resolveNonInteractive({
        envValue: '0',
        cliFlag: true,
        explicitCliFalse: false,
        isAgent: true,
        stdinIsTTY: false,
      })
    ).toEqual({
      nonInteractive: false,
      fromEnv: true,
      parsedEnv: false,
    });
  });

  it('falls back to agent and non-tty when env is missing/invalid', () => {
    expect(
      resolveNonInteractive({
        envValue: undefined,
        cliFlag: false,
        explicitCliFalse: false,
        isAgent: true,
        stdinIsTTY: false,
      })
    ).toEqual({
      nonInteractive: true,
      fromEnv: false,
      parsedEnv: undefined,
    });

    expect(
      resolveNonInteractive({
        envValue: 'invalid',
        cliFlag: false,
        explicitCliFalse: false,
        isAgent: false,
        stdinIsTTY: false,
      })
    ).toEqual({
      nonInteractive: false,
      fromEnv: false,
      parsedEnv: undefined,
    });
  });

  it('falls back to legacy --non-interactive flag semantics when env unset', () => {
    expect(
      resolveNonInteractive({
        envValue: undefined,
        cliFlag: true,
        explicitCliFalse: false,
        isAgent: false,
        stdinIsTTY: true,
      })
    ).toEqual({
      nonInteractive: true,
      fromEnv: false,
      parsedEnv: undefined,
    });

    expect(
      resolveNonInteractive({
        envValue: undefined,
        cliFlag: true,
        explicitCliFalse: true,
        isAgent: true,
        stdinIsTTY: false,
      })
    ).toEqual({
      nonInteractive: false,
      fromEnv: false,
      parsedEnv: undefined,
    });
  });
});
