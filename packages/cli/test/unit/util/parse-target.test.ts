import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import parseTarget, {
  applyDeprecatedTargetFlag,
  warnDeprecatedProdFlag,
} from '../../../src/util/parse-target';
import output from '../../../src/output-manager';
import { client } from '../../mocks/client';

describe('parseTarget', () => {
  beforeEach(() => {
    vi.spyOn(output, 'debug');
    vi.spyOn(output, 'warning');
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
    expect(output.warning).toHaveBeenCalledWith(
      'Ignoring --prod because --target is also set. Pass only one of them.'
    );
    expect(result).toEqual('staging');
  });

  it('names --environment when it is set with --prod', () => {
    const result = parseTarget({
      flagName: 'environment',
      flags: { '--environment': 'staging', '--prod': true },
    });
    expect(output.warning).toHaveBeenCalledWith(
      'Ignoring --prod because --environment is also set. Pass only one of them.'
    );
    expect(result).toEqual('staging');
  });

  it('names the --target the user typed after it was copied to --environment', () => {
    const result = parseTarget({
      flagName: 'environment',
      flags: {
        '--environment': 'staging',
        '--target': 'staging',
        '--prod': true,
      },
    });
    expect(output.warning).toHaveBeenCalledWith(
      'Ignoring --prod because --target is also set. Pass only one of them.'
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

describe('applyDeprecatedTargetFlag', () => {
  beforeEach(() => {
    client.reset();
  });

  it('leaves --environment alone and does not warn', () => {
    const flags = { '--environment': 'preview' };
    expect(applyDeprecatedTargetFlag(client, flags)).toBe(true);
    expect(flags).toEqual({ '--environment': 'preview' });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('copies --target into --environment with a deprecation warning', () => {
    const flags: { '--environment'?: string; '--target'?: string } = {
      '--target': 'staging',
    };
    expect(applyDeprecatedTargetFlag(client, flags)).toBe(true);
    expect(flags['--environment']).toBe('staging');
    expect(client.stderr.getFullOutput()).toContain(
      '--target is deprecated. Use --environment.'
    );
  });

  it('skips the warning with --json', () => {
    client.setArgv('deploy', '--target', 'staging', '--json');
    const flags: { '--environment'?: string; '--target'?: string } = {
      '--target': 'staging',
    };
    expect(applyDeprecatedTargetFlag(client, flags)).toBe(true);
    expect(flags['--environment']).toBe('staging');
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('rejects --target together with --environment', () => {
    const flags = { '--environment': 'preview', '--target': 'production' };
    expect(applyDeprecatedTargetFlag(client, flags)).toBe(false);
    expect(flags['--environment']).toBe('preview');
    expect(client.stderr.getFullOutput()).toContain(
      "Can't use --target with --environment. Use --environment."
    );
  });
});

describe('warnDeprecatedProdFlag', () => {
  beforeEach(() => {
    client.reset();
  });

  it('warns when --prod is passed', () => {
    warnDeprecatedProdFlag(client, { '--prod': true });
    expect(client.stderr.getFullOutput()).toContain(
      '--prod is deprecated. Use --environment production.'
    );
  });

  it('stays quiet without --prod', () => {
    warnDeprecatedProdFlag(client, {});
    expect(client.stderr.getFullOutput()).toBe('');
  });
});
