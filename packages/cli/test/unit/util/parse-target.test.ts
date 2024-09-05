import { describe, beforeEach, it, expect } from 'vitest';
import parseTarget from '../../../src/util/parse-target';
import { Output } from '../../../src/util/output';
import { vi } from 'vitest';

describe('parseTarget', () => {
  let output: Output;

  beforeEach(() => {
    output = new Output();
    output.warn = vi.fn();
    output.debug = vi.fn();
  });

  it('defaults to `undefined`', () => {
    let result = parseTarget({
      output,
      flagName: 'target',
      flags: {},
    });
    expect(result).toEqual(undefined);
  });

  it('parses "production" target', () => {
    let result = parseTarget({
      output,
      flagName: 'target',
      flags: { '--target': 'production' },
    });
    expect(result).toEqual('production');
    expect(output.debug).toHaveBeenCalledWith('Setting target to production');
  });

  it('parses "staging" target', () => {
    let result = parseTarget({
      output,
      flagName: 'target',
      flags: { '--target': 'staging' },
    });
    expect(result).toEqual('staging');
    expect(output.debug).toHaveBeenCalledWith('Setting target to staging');
  });

  it('prefers target over production argument', () => {
    let result = parseTarget({
      output,
      flagName: 'target',
      flags: { '--target': 'staging', '--prod': true },
    });
    expect(output.warn).toHaveBeenCalledWith(
      'Both `--prod` and `--target` detected. Ignoring `--prod`.'
    );
    expect(result).toEqual('staging');
  });

  it('parses production argument when `true`', () => {
    let result = parseTarget({
      output,
      flagName: 'target',
      flags: { '--prod': true },
    });
    expect(result).toEqual('production');
  });

  it('parses production argument when `false`', () => {
    let result = parseTarget({
      output,
      flagName: 'target',
      flags: { '--prod': false },
    });
    expect(result).toEqual(undefined);
  });
});
