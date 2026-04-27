import { describe, expect, it } from 'vitest';
import {
  getGlobalFlagsOnlyFromArgs,
  getSameSubcommandSuggestionFlags,
} from '../../../src/util/arg-common';

describe('getSameSubcommandSuggestionFlags', () => {
  it('preserves subcommand value flags and globals for same-command suggestions', () => {
    const afterAdd = ['--slug', 'acme', '--cwd', '/tmp', '--non-interactive'];
    const out = getSameSubcommandSuggestionFlags(afterAdd);
    expect(out).toEqual([
      '--slug',
      'acme',
      '--cwd',
      '/tmp',
      '--non-interactive',
    ]);
  });

  it('does not attach a value to boolean flags', () => {
    const args = ['--yes', '--cwd', '/p'];
    const out = getSameSubcommandSuggestionFlags(args);
    expect(out).toEqual(['--yes', '--cwd', '/p']);
  });

  it('skips bare positionals', () => {
    const args = ['/old', '/new', '--status', '301', '--yes'];
    const out = getSameSubcommandSuggestionFlags(args);
    expect(out).toEqual(['--status', '301', '--yes']);
  });

  it('strips token flags and values', () => {
    const args = [
      '--slug',
      'acme',
      '--token',
      'secret-token',
      '-t=other-secret',
      '--yes',
    ];
    const out = getSameSubcommandSuggestionFlags(args);
    expect(out).toEqual(['--slug', 'acme', '--yes']);
  });
});

describe('getGlobalFlagsOnlyFromArgs', () => {
  it('drops subcommand-specific flags when suggesting a different command', () => {
    const afterAdd = ['--slug', 'acme', '--cwd', '/tmp', '--status', '301'];
    const out = getGlobalFlagsOnlyFromArgs(afterAdd);
    expect(out).toContain('--cwd');
    expect(out).toContain('/tmp');
    expect(out).not.toContain('--slug');
    expect(out).not.toContain('acme');
    expect(out).not.toContain('--status');
    expect(out).not.toContain('301');
  });

  it('strips token flags from preserved globals', () => {
    const afterAdd = [
      '--cwd',
      '/tmp',
      '--non-interactive',
      '--token',
      'secret-token',
      '-t=other-secret',
      '--yes',
    ];
    const out = getGlobalFlagsOnlyFromArgs(afterAdd);
    expect(out).toEqual(['--cwd', '/tmp', '--non-interactive']);
  });
});
