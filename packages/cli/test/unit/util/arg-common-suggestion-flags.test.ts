import { afterEach, describe, expect, it } from 'vitest';
import {
  getGlobalFlagsFromArgs,
  getProjectOptionFromArgs,
  getSameSubcommandSuggestionFlags,
} from '../../../src/util/arg-common';
import { setCommandFlagsSpecification } from '../../../src/util/get-flags-specification';

afterEach(() => {
  setCommandFlagsSpecification(undefined);
});

// A command whose own parse reads `-p` as `--position`, like `flags rules add`.
function runPositionCommand() {
  setCommandFlagsSpecification({ '--position': Number, '-p': '--position' });
}

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

  it('preserves values for env suggestion flags', () => {
    const args = [
      '--environment',
      'preview',
      '--git-branch',
      'feature',
      '--deployment',
      'dpl_123',
      '--id',
      'dpl_123',
      '--value',
      'next-value',
    ];
    expect(getSameSubcommandSuggestionFlags(args)).toEqual(args);
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

  it('strips bare --token values that start with a dash', () => {
    const args = ['--slug', 'acme', '--token', '-secret-token', '--yes'];
    const out = getSameSubcommandSuggestionFlags(args);
    expect(out).toEqual(['--slug', 'acme', '--yes']);
  });

  it('keeps the value of -p, like --project', () => {
    expect(getSameSubcommandSuggestionFlags(['-p', 'acme', '--yes'])).toEqual([
      '-p',
      'acme',
      '--yes',
    ]);
    expect(getSameSubcommandSuggestionFlags(['-yp', 'acme'])).toEqual([
      '-yp',
      'acme',
    ]);
  });

  it('treats -n like --limit', () => {
    expect(getSameSubcommandSuggestionFlags(['-n', '5', '--yes'])).toEqual(
      getSameSubcommandSuggestionFlags(['--limit', '5', '--yes']).map(arg =>
        arg === '--limit' ? '-n' : arg
      )
    );
  });

  it('leaves -p alone where it means something else', () => {
    runPositionCommand();
    expect(getSameSubcommandSuggestionFlags(['-p', '2', '--yes'])).toEqual([
      '-p',
      '--yes',
    ]);
  });
});

describe('getProjectOptionFromArgs', () => {
  it('reads spaced and joined project options', () => {
    expect(getProjectOptionFromArgs(['--project', 'payments-api'])).toBe(
      'payments-api'
    );
    expect(getProjectOptionFromArgs(['--project=payments-api'])).toBe(
      'payments-api'
    );
  });

  it('ignores project options passed to a child command', () => {
    expect(
      getProjectOptionFromArgs(['--', '--project', 'child-project'])
    ).toBeUndefined();
  });

  it('reads -p, alone or last in a group, like --project', () => {
    expect(getProjectOptionFromArgs(['-p', 'payments-api'])).toBe(
      'payments-api'
    );
    expect(getProjectOptionFromArgs(['-yp', 'payments-api'])).toBe(
      'payments-api'
    );
    expect(getProjectOptionFromArgs(['--', '-p', 'child'])).toBeUndefined();
  });

  it('ignores -p where the command reads it as another option', () => {
    runPositionCommand();
    expect(getProjectOptionFromArgs(['-p', '2'])).toBeUndefined();
  });
});

describe('getGlobalFlagsFromArgs with project context', () => {
  it('preserves project context while removing unrelated and sensitive flags', () => {
    expect(
      getGlobalFlagsFromArgs(
        [
          '--project',
          'payments-api',
          '--cwd',
          '/tmp/project',
          '--token',
          'secret',
          '--status',
          '301',
        ],
        { preserveProject: true }
      )
    ).toEqual(['--cwd', '/tmp/project', '--project', 'payments-api']);
  });

  it('preserves -p as the same --project context', () => {
    const args = ['--cwd', '/tmp/project', '--status', '301'];
    expect(
      getGlobalFlagsFromArgs(['-p', 'payments-api', ...args], {
        preserveProject: true,
      })
    ).toEqual(
      getGlobalFlagsFromArgs(['--project', 'payments-api', ...args], {
        preserveProject: true,
      })
    );
  });

  it('ignores project flags passed to a child command', () => {
    expect(
      getGlobalFlagsFromArgs(
        [
          '--cwd',
          '/tmp/project',
          '--',
          '--project',
          'child-project',
          '--scope',
          'child-scope',
          '--cwd',
          '/tmp/child',
        ],
        { preserveProject: true }
      )
    ).toEqual(['--cwd', '/tmp/project']);
  });
});

describe('getGlobalFlagsFromArgs', () => {
  it('drops subcommand-specific flags when suggesting a different command', () => {
    const afterAdd = ['--slug', 'acme', '--cwd', '/tmp', '--status', '301'];
    const out = getGlobalFlagsFromArgs(afterAdd);
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
    const out = getGlobalFlagsFromArgs(afterAdd);
    expect(out).toEqual(['--cwd', '/tmp', '--non-interactive']);
  });

  it('strips shorthand -t values that start with a dash', () => {
    const afterAdd = ['--cwd', '/tmp', '-t', '-secret-token', '--yes'];
    const out = getGlobalFlagsFromArgs(afterAdd);
    expect(out).toEqual(['--cwd', '/tmp']);
  });
});
