import { beforeEach, describe, expect, it } from 'vitest';
import { applyDeprecatedGitBranchFlag } from '../../../src/util/git-branch-option';
import { client } from '../../mocks/client';

describe('applyDeprecatedGitBranchFlag', () => {
  beforeEach(() => {
    client.reset();
  });

  it('leaves --git-branch alone and does not warn', () => {
    const flags = { '--git-branch': 'main' };
    expect(applyDeprecatedGitBranchFlag(client, flags, '--branch')).toBe(
      undefined
    );
    expect(flags).toEqual({ '--git-branch': 'main' });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it.each([
    '--branch',
    '--ref',
    '--trigger-branch',
  ] as const)('moves %s to --git-branch with a deprecation warning', oldName => {
    const flags: Record<string, string | undefined> = { [oldName]: 'feat' };
    expect(applyDeprecatedGitBranchFlag(client, flags, oldName)).toBe(
      undefined
    );
    expect(flags).toEqual({ '--git-branch': 'feat' });
    expect(client.stderr.getFullOutput()).toContain(
      `${oldName} is deprecated. Use --git-branch.`
    );
  });

  it('moves a repeated value as is', () => {
    const flags: { '--git-branch'?: string[]; '--branch'?: string[] } = {
      '--branch': ['a', 'b'],
    };
    applyDeprecatedGitBranchFlag(client, flags, '--branch');
    expect(flags).toEqual({ '--git-branch': ['a', 'b'] });
  });

  it('keeps an empty old value, like before the rename', () => {
    const flags: { '--git-branch'?: string; '--ref'?: string } = {
      '--ref': '',
    };
    expect(applyDeprecatedGitBranchFlag(client, flags, '--ref')).toBe(
      undefined
    );
    expect(flags).toEqual({ '--git-branch': '' });
  });

  it('names the spelling that was typed', () => {
    const flags: { '--git-branch'?: string; '--ref'?: string } = {
      '--ref': 'main',
    };
    applyDeprecatedGitBranchFlag(client, flags, '--ref', '-r');
    expect(client.stderr.getFullOutput()).toContain(
      '-r is deprecated. Use --git-branch.'
    );
  });

  it('skips the warning with --json', () => {
    client.setArgv('ci', 'ls', '--branch', 'feat', '--json');
    const flags: { '--git-branch'?: string; '--branch'?: string } = {
      '--branch': 'feat',
    };
    applyDeprecatedGitBranchFlag(client, flags, '--branch');
    expect(flags['--git-branch']).toBe('feat');
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('returns an error, without warning or changing flags, when both are given', () => {
    const flags = { '--git-branch': 'main', '--branch': 'feat' };
    expect(applyDeprecatedGitBranchFlag(client, flags, '--branch')).toBe(
      "Can't use --branch with --git-branch. Use --git-branch."
    );
    expect(flags).toEqual({ '--git-branch': 'main', '--branch': 'feat' });
    expect(client.stderr.getFullOutput()).toBe('');
  });
});
