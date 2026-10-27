import { describe, expect, it } from 'vitest';
import {
  getRenamedOption,
  renameOptionInArgs,
  reportRenamedOptionError,
  withWarnings,
} from '../../../src/util/renamed-option';
import { client } from '../../mocks/client';

describe('getRenamedOption', () => {
  it('reads the new name without a warning', () => {
    expect(
      getRenamedOption({ '--deployment': 'dpl_1' }, '--deployment', '--dpl')
    ).toEqual({ value: 'dpl_1' });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('is undefined when neither name is given', () => {
    expect(getRenamedOption({}, '--deployment', '--dpl')).toEqual({
      value: undefined,
    });
  });

  it('reads the old name and warns on stderr', () => {
    expect(
      getRenamedOption({ '--dpl': 'dpl_1' }, '--deployment', '--dpl')
    ).toEqual({ value: 'dpl_1' });
    expect(client.stderr.getFullOutput()).toBe(
      '! --dpl is deprecated. Use --deployment.\n'
    );
  });

  it('returns the warning instead of printing it for JSON output', () => {
    expect(
      getRenamedOption({ '--dpl': 'dpl_1' }, '--deployment', '--dpl', {
        json: true,
      })
    ).toEqual({
      value: 'dpl_1',
      warning: {
        reason: 'deprecated',
        message: '--dpl is deprecated. Use --deployment.',
      },
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it.each(['', '  '])('rejects an empty value for the new name: %j', value => {
    expect(
      getRenamedOption({ '--deployment': value }, '--deployment', '--dpl')
    ).toEqual({ error: "--deployment can't be empty." });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('returns an empty value for the old name as before, with the warning', () => {
    expect(getRenamedOption({ '--dpl': '' }, '--deployment', '--dpl')).toEqual({
      value: '',
    });
    expect(client.stderr.getFullOutput()).toBe(
      '! --dpl is deprecated. Use --deployment.\n'
    );
  });

  it('rejects both names, even with the same value', () => {
    expect(
      getRenamedOption(
        { '--deployment': 'dpl_1', '--dpl': 'dpl_1' },
        '--deployment',
        '--dpl'
      )
    ).toEqual({ error: "Can't use --deployment with --dpl." });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it.each([
    ['a Boolean', true],
    ['a number', 0],
    ['a list', ['a=1', 'b=2']],
  ])('reads %s option under its old name as is', (_kind, value) => {
    expect(getRenamedOption({ '--old': value }, '--new', '--old')).toEqual({
      value,
    });
    expect(client.stderr.getFullOutput()).toBe(
      '! --old is deprecated. Use --new.\n'
    );
  });

  it.each([
    ['a Boolean', true],
    ['a number', 0],
    ['an empty list', []],
  ])('reads %s option under its new name without an empty check', (_kind, value) => {
    expect(getRenamedOption({ '--new': value }, '--new', '--old')).toEqual({
      value,
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('names the spelling that was typed', () => {
    expect(
      getRenamedOption({ '--search': 'a' }, '--query', '--search', {
        typedName: '-s',
      })
    ).toEqual({ value: 'a' });
    expect(client.stderr.getFullOutput()).toBe(
      '! -s is deprecated. Use --query.\n'
    );
    expect(
      getRenamedOption(
        { '--query': 'a', '--search': 'b' },
        '--query',
        '--search',
        { typedName: '-s' }
      )
    ).toEqual({ error: "Can't use --query with -s." });
  });
});

describe('reportRenamedOptionError', () => {
  it('prints the human error and returns 2', () => {
    expect(reportRenamedOptionError(client, "Can't use --a with --b.")).toBe(2);
    expect(client.stderr.getFullOutput()).toContain("Can't use --a with --b.");
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('writes a JSON error for a non-interactive run', () => {
    client.nonInteractive = true;
    expect(reportRenamedOptionError(client, "Can't use --a with --b.")).toBe(2);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
      message: "Can't use --a with --b.",
    });
  });

  it('writes a JSON error for --json in an interactive run', () => {
    expect(
      reportRenamedOptionError(client, "Can't use --a with --b.", {
        json: true,
      })
    ).toBe(2);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
      message: "Can't use --a with --b.",
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });
});

describe('renameOptionInArgs', () => {
  it('renames the old option and its = form, and nothing else', () => {
    expect(
      renameOptionInArgs(
        ['env', 'pull', '--id', 'dpl_1', '--id=dpl_2', '--identity', 'x'],
        '--id',
        '--deployment'
      )
    ).toEqual([
      'env',
      'pull',
      '--deployment',
      'dpl_1',
      '--deployment=dpl_2',
      '--identity',
      'x',
    ]);
  });

  it('leaves arguments after -- alone', () => {
    expect(
      renameOptionInArgs(['curl', '--', '--id', '1'], '--id', '--deployment')
    ).toEqual(['curl', '--', '--id', '1']);
  });
});

describe('withWarnings', () => {
  const warning = {
    reason: 'deprecated',
    message: '--dpl is deprecated. Use --deployment.',
  } as const;

  it('returns the result as is without warnings', () => {
    const result = { a: 1 };
    expect(withWarnings(result, [undefined])).toBe(result);
  });

  it('adds the warnings after the ones the result has', () => {
    const existing = { reason: 'incomplete_results', message: 'Partial.' };
    expect(
      withWarnings({ a: 1, warnings: [existing] }, [warning, undefined])
    ).toEqual({ a: 1, warnings: [existing, warning] });
  });
});
