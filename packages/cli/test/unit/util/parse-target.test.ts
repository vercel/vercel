import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import parseTarget, {
  parseAliasedTarget,
} from '../../../src/util/parse-target';
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

describe('parseAliasedTarget', () => {
  beforeEach(() => {
    vi.spyOn(output, 'debug');
    vi.spyOn(output, 'warn');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to the command default', () => {
    expect(parseAliasedTarget({ flags: {}, defaultTarget: 'preview' })).toEqual(
      'preview'
    );
    expect(
      parseAliasedTarget({ flags: {}, defaultTarget: 'development' })
    ).toEqual('development');
  });

  it('accepts `--target` and `--environment` interchangeably', () => {
    expect(
      parseAliasedTarget({
        flags: { '--target': 'production' },
        defaultTarget: 'preview',
      })
    ).toEqual('production');
    expect(
      parseAliasedTarget({
        flags: { '--environment': 'production' },
        defaultTarget: 'preview',
      })
    ).toEqual('production');
  });

  it('accepts a custom environment slug', () => {
    expect(
      parseAliasedTarget({
        flags: { '--environment': 'my-custom-env' },
        defaultTarget: 'preview',
      })
    ).toEqual('my-custom-env');
  });

  it('infers `preview` from `--git-branch`', () => {
    expect(
      parseAliasedTarget({
        flags: { '--git-branch': 'feature-branch' },
        defaultTarget: 'development',
      })
    ).toEqual('preview');
  });

  it('lets an explicit environment win over `--git-branch` inference', () => {
    expect(
      parseAliasedTarget({
        flags: { '--git-branch': 'feature-branch', '--target': 'production' },
        defaultTarget: 'development',
      })
    ).toEqual('production');
  });

  it('warns and prefers `--target` when the aliases disagree', () => {
    const result = parseAliasedTarget({
      flags: { '--target': 'production', '--environment': 'preview' },
      defaultTarget: 'development',
    });
    expect(result).toEqual('production');
    expect(output.warn).toHaveBeenCalledWith(
      'Both `--target` and `--environment` detected with different values. Using `--target production`.'
    );
  });

  it('does not warn when the aliases agree', () => {
    const result = parseAliasedTarget({
      flags: { '--target': 'preview', '--environment': 'preview' },
      defaultTarget: 'development',
    });
    expect(result).toEqual('preview');
    expect(output.warn).not.toHaveBeenCalled();
  });

  it('resolves `--prod` to production', () => {
    expect(
      parseAliasedTarget({
        flags: { '--prod': true },
        defaultTarget: 'preview',
      })
    ).toEqual('production');
  });

  it('prefers an explicit environment over `--prod`', () => {
    const result = parseAliasedTarget({
      flags: { '--prod': true, '--environment': 'preview' },
      defaultTarget: 'development',
    });
    expect(result).toEqual('preview');
    expect(output.warn).toHaveBeenCalledWith(
      'Both `--prod` and an explicit environment detected. Ignoring `--prod`.'
    );
  });

  it('prefers `--prod` over `--git-branch` inference', () => {
    expect(
      parseAliasedTarget({
        flags: { '--prod': true, '--git-branch': 'feature-branch' },
        defaultTarget: 'development',
      })
    ).toEqual('production');
  });
});
