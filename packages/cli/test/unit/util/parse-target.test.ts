import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import parseTarget from '../../../src/util/parse-target';
import output from '../../../src/output-manager';

describe('parseTarget', () => {
  beforeEach(() => {
    vi.spyOn(output, 'debug');
    vi.spyOn(output, 'warn');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to `undefined`', () => {
    const result = parseTarget({
      flagName: 'target',
      flags: {},
    });
    expect(result).toEqual(undefined);
  });

  it('parses "production" target', () => {
    const result = parseTarget({
      flagName: 'target',
      flags: { '--target': 'production' },
    });
    expect(result).toEqual('production');
    expect(output.debug).toHaveBeenCalledWith('Setting target to production');
  });

  it('parses "staging" target', () => {
    const result = parseTarget({
      flagName: 'target',
      flags: { '--target': 'staging' },
    });
    expect(result).toEqual('staging');
    expect(output.debug).toHaveBeenCalledWith('Setting target to staging');
  });

  it('prefers target over production argument', () => {
    const result = parseTarget({
      flagName: 'target',
      flags: { '--target': 'staging', '--prod': true },
    });
    expect(output.warn).toHaveBeenCalledWith(
      'Both `--prod` and `--target` detected. Ignoring `--prod`.'
    );
    expect(result).toEqual('staging');
  });

  it('parses production argument when `true`', () => {
    const result = parseTarget({
      flagName: 'target',
      flags: { '--prod': true },
    });
    expect(result).toEqual('production');
  });

  it('parses production argument when `false`', () => {
    const result = parseTarget({
      flagName: 'target',
      flags: { '--prod': false },
    });
    expect(result).toEqual(undefined);
  });
});
