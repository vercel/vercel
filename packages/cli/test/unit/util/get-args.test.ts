import type { Spec } from 'arg';
import { describe, expect, it } from 'vitest';
import {
  getTypedOptionName,
  getUsedDeprecatedShorthands,
  isArgumentError,
  parseArguments,
  parseWithShortFlag,
  takeCommand,
} from '../../../src/util/get-args';
import { getFlagsSpecification } from '../../../src/util/get-flags-specification';
import { nextCursorOption } from '../../../src/util/arg-common';
import { client } from '../../mocks/client';
import {
  isLocalSchedulesCommand,
  parseSchedulesArguments,
} from '../../../src/util/schedules/local-mode';

const specification = {
  '--value': String,
  '-x': '--value',
  '-v': Boolean,
};

describe('takeCommand', () => {
  it.each([
    [
      ['--value', 'list', 'scale', 'worker'],
      'scale',
      ['--value', 'list', 'worker'],
    ],
    [['-x', 'scale', 'list'], 'list', ['-x', 'scale']],
    [['--value=list', 'list'], 'list', ['--value=list']],
    [
      ['--scope', 'list', 'scale', 'worker'],
      'scale',
      ['--scope', 'list', 'worker'],
    ],
    [['list', '--', '--value'], 'list', ['--', '--value']],
    [['--value', 'list'], undefined, ['--value', 'list']],
  ])('removes only the command from %j', (args, command, remaining) => {
    expect(takeCommand(args, specification)).toEqual({
      command,
      args: remaining,
    });
  });

  it('uses shared option validation before the command', () => {
    try {
      takeCommand(['--value'], specification);
      expect.unreachable('Expected parsing to fail');
    } catch (error) {
      expect(isArgumentError(error)).toBe(true);
      if (!isArgumentError(error)) throw error;
      expect(error.invalidOption).toBe('--value');
    }
  });
});

describe('trusted local argument errors', () => {
  it.each([
    { args: ['--value'], option: '--value' },
    { args: ['-x'], option: '-x' },
    { args: ['-xv'], option: '-x' },
  ])('marks missing values for $args as argument errors', ({
    args,
    option,
  }) => {
    try {
      parseArguments(args, specification);
      expect.unreachable('Expected parsing to fail');
    } catch (error) {
      expect(isArgumentError(error)).toBe(true);
      if (!isArgumentError(error)) throw error;
      expect(error.invalidOption).toBe(option);
      expect(error.allowedOptions).toContain('--value');
      expect(error.suggestedOption).toBeUndefined();
    }
  });

  it('does not trust error codes from other sources', () => {
    const forged = Object.assign(
      new Error('option requires argument: --value'),
      {
        code: 'ARG_MISSING_REQUIRED_LONGARG',
        allowedOptions: ['--value'],
      }
    );
    expect(isArgumentError(forged)).toBe(false);
  });

  it('does not classify parser configuration failures as user input', () => {
    try {
      parseArguments([], { invalid: String });
      expect.unreachable('Expected invalid parser configuration to fail');
    } catch (error) {
      expect(isArgumentError(error)).toBe(false);
    }
  });
});

describe('parseArguments -N', () => {
  const nextSpecification = getFlagsSpecification([
    nextCursorOption,
    { name: 'json', shorthand: null, type: Boolean, deprecated: false },
  ]);

  it('reads -N as --next and warns, naming the replacement', () => {
    client.setArgv('dns', 'ls');
    const { flags } = parseArguments(['-N', 'abc'], nextSpecification);
    expect(flags['--next']).toBe('abc');
    expect(client.stderr.getFullOutput()).toBe(
      '! -N is deprecated. Use --next.\n'
    );
  });

  it('warns for -N inside a group of short flags', () => {
    client.setArgv('dns', 'ls');
    const { flags } = parseArguments(
      ['-dN', 'abc'],
      getFlagsSpecification([nextCursorOption])
    );
    expect(flags['--next']).toBe('abc');
    expect(client.stderr.getFullOutput()).toContain('-N is deprecated');
  });

  it('does not warn for --next', () => {
    client.setArgv('dns', 'ls');
    parseArguments(['--next', 'abc'], nextSpecification);
    parseArguments(['--next=-N'], nextSpecification);
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('does not warn with --json, so stderr stays clean', () => {
    client.setArgv('dns', 'ls');
    parseArguments(['-N', 'abc', '--json'], nextSpecification);
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('leaves the warning to the strict parse when a router parses first', () => {
    client.setArgv('dns', 'ls');
    parseArguments(['-N', 'abc'], nextSpecification, { permissive: true });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('does not warn when the parse only inspects argv', () => {
    client.setArgv('dns', 'ls');
    const { flags } = parseArguments(['-N', 'abc'], nextSpecification, {
      warnDeprecated: false,
    });
    expect(flags['--next']).toBe('abc');
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('does not warn from the startup check for local schedules', () => {
    // It runs for every command, including ones without --next.
    client.setArgv('whoami');
    expect(
      isLocalSchedulesCommand(['node', 'vercel', 'whoami', '-N', 'x'])
    ).toBe(false);
    parseSchedulesArguments(['node', 'vercel', 'schedules', 'list', '-N', 'x']);
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('does not warn for -N after --', () => {
    client.setArgv('dns', 'ls');
    parseArguments(['--next', 'abc', '--', '-N'], nextSpecification);
    expect(client.stderr.getFullOutput()).toBe('');
  });
});

describe('parseArguments --no-', () => {
  const booleanSpecification = {
    '--prod': Boolean,
    '-p': '--prod',
    '--name': String,
    '--wait': Boolean,
    '--no-wait': Boolean,
  };

  it('accepts --no-x for every Boolean --x, leaving --x off', () => {
    const { flags } = parseArguments(['--no-prod'], booleanSpecification);
    expect(flags['--prod']).toBeUndefined();
    expect(flags).not.toHaveProperty('--no-prod');
  });

  it('applies to global Boolean options too', () => {
    const { flags } = parseArguments(['--no-debug'], booleanSpecification);
    expect(flags['--debug']).toBeUndefined();
  });

  it.each([
    [['--prod', '--no-prod']],
    [['--no-prod', '--prod']],
    [['-p', '--no-prod']],
    [['--prod=true', '--no-prod']],
  ])('rejects %j as a usage error', args => {
    try {
      parseArguments(args, booleanSpecification);
      expect.unreachable('Expected parsing to fail');
    } catch (error) {
      expect(isArgumentError(error)).toBe(true);
      expect((error as Error & { code: string }).code).toBe(
        'ARG_CONFLICTING_OPTIONS'
      );
      expect((error as Error).message).toBe("Can't use --prod with --no-prod.");
    }
  });

  it('keeps an option that declares its own --no-x', () => {
    const { flags } = parseArguments(
      ['--wait', '--no-wait'],
      booleanSpecification
    );
    expect(flags['--wait']).toBe(true);
    expect(flags['--no-wait']).toBe(true);
  });

  it('does not add --no-x for options that take a value', () => {
    expect(() => parseArguments(['--no-name'], booleanSpecification)).toThrow(
      'unknown or unexpected option: --no-name'
    );
  });

  it('does not list the --no- forms as allowed options', () => {
    try {
      parseArguments(['--nope'], booleanSpecification);
      expect.unreachable('Expected parsing to fail');
    } catch (error) {
      if (!isArgumentError(error)) throw error;
      expect(error.allowedOptions).toContain('--prod');
      expect(error.allowedOptions).not.toContain('--no-prod');
    }
  });

  it.each([
    [['--no-debug', 'whoami'], ['whoami']],
    [
      ['flags', '--no-debug', 'list'],
      ['flags', 'list'],
    ],
    [
      ['--no-prod', 'deploy', '--no-other'],
      ['deploy', '--no-other'],
    ],
  ])('routes %j past a --no-x in a permissive parse', (args, positional) => {
    const result = parseArguments(args, booleanSpecification, {
      permissive: true,
    });
    expect(result.args).toEqual(positional);
    expect(result.flags['--debug']).toBeUndefined();
    expect(result.flags['--prod']).toBeUndefined();
  });

  it('leaves a conflict to the strict parse in a permissive parse', () => {
    const { args, flags } = parseArguments(
      ['--prod', '--no-prod', 'deploy'],
      booleanSpecification,
      { permissive: true }
    );
    expect(args).toEqual(['deploy']);
    expect(flags['--prod']).toBe(true);
  });

  it('keeps --no-x as typed for argv handed to another program', () => {
    const { args } = parseArguments(
      ['my-extension', '--no-debug', 'x'],
      booleanSpecification,
      { permissive: true, keepNegations: true }
    );
    expect(args).toEqual(['my-extension', '--no-debug', 'x']);
  });

  it('leaves --no-x after -- to the child command', () => {
    const { args, flags } = parseArguments(
      ['--', '--no-prod'],
      booleanSpecification
    );
    expect(args).toEqual(['--no-prod']);
    expect(flags['--prod']).toBeUndefined();
  });

  it('leaves --no-x after the command to takeCommand', () => {
    expect(takeCommand(['list', '--no-prod'], booleanSpecification)).toEqual({
      command: 'list',
      args: ['--no-prod'],
    });
  });
});

describe('parseArguments hidden short flags', () => {
  const spec = getFlagsSpecification([
    {
      name: 'description',
      shorthand: null,
      deprecatedShorthand: 'd',
      type: String,
      deprecated: false,
    },
    {
      name: 'label',
      shorthand: null,
      deprecatedShorthand: 'l',
      type: [String],
      deprecated: false,
    },
    { name: 'yes', shorthand: 'y', type: Boolean, deprecated: false },
    { name: 'json', shorthand: null, type: Boolean, deprecated: false },
  ]);

  it('reads the old letter as the long option and warns once', () => {
    client.setArgv('flags', 'create');
    const { flags } = parseArguments(['-d', 'Checkout'], spec);
    expect(flags['--description']).toBe('Checkout');
    expect(flags['--debug']).toBeUndefined();
    expect(client.stderr.getFullOutput()).toBe(
      '! -d is deprecated. Use --description.\n'
    );
  });

  it('warns for the old letter at the end of a group of short flags', () => {
    client.setArgv('flags', 'create');
    const { flags } = parseArguments(['-yd', 'Checkout'], spec);
    expect(flags).toMatchObject({ '--yes': true, '--description': 'Checkout' });
    expect(client.stderr.getFullOutput()).toBe(
      '! -d is deprecated. Use --description.\n'
    );
  });

  it('warns once for a repeated letter, and keeps every value', () => {
    client.setArgv('flags', 'create');
    const { flags } = parseArguments(
      ['-l', 'a', '--label', 'b', '-l', 'c'],
      spec
    );
    expect(flags['--label']).toEqual(['a', 'b', 'c']);
    expect(client.stderr.getFullOutput()).toBe(
      '! -l is deprecated. Use --label.\n'
    );
  });

  it('still warns when the command also gets a --no- flag', () => {
    client.setArgv('flags', 'create');
    const { flags } = parseArguments(['-d', 'Checkout', '--no-yes'], spec);
    expect(flags['--description']).toBe('Checkout');
    expect(client.stderr.getFullOutput()).toBe(
      '! -d is deprecated. Use --description.\n'
    );
  });

  it('warns once per run, however many times the command parses', () => {
    client.setArgv('flags', 'create');
    parseArguments(['-d', 'a'], spec);
    parseArguments(['-d', 'b'], spec);
    expect(client.stderr.getFullOutput()).toBe(
      '! -d is deprecated. Use --description.\n'
    );
  });

  it('does not warn for the long name, or for letters after --', () => {
    client.setArgv('flags', 'create');
    const { args, flags } = parseArguments(
      ['--description', 'a', '--description=-d', '--', '-d', 'b'],
      spec
    );
    expect(flags['--description']).toBe('-d');
    expect(args).toEqual(['-d', 'b']);
    expect(client.stderr.getFullOutput()).toBe('');
    expect(getUsedDeprecatedShorthands()).toEqual([]);
  });

  it('does not warn with --json, but still counts the use', () => {
    client.setArgv('flags', 'create');
    parseArguments(['-d', 'a', '--json'], spec);
    expect(client.stderr.getFullOutput()).toBe('');
    expect(getUsedDeprecatedShorthands()).toEqual(['-d']);
  });

  it('leaves the warning and the count to the strict parse', () => {
    client.setArgv('flags', 'create');
    parseArguments(['-d', 'a'], spec, { permissive: true });
    parseArguments(['-d', 'a'], spec, { warnDeprecated: false });
    expect(client.stderr.getFullOutput()).toBe('');
    expect(getUsedDeprecatedShorthands()).toEqual([]);
  });

  it('fails as before, without a warning, when the letter has no value', () => {
    client.setArgv('flags', 'create');
    expect(() => parseArguments(['-d=Checkout'], spec)).toThrow(
      'option requires argument (but was followed by another short argument): -d'
    );
    expect(() => parseArguments(['-dy', 'Checkout'], spec)).toThrow(
      'option requires argument (but was followed by another short argument): -d'
    );
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('keeps -d as --debug where the command has no hidden -d', () => {
    client.setArgv('whoami');
    const { flags } = parseArguments(['-d'], getFlagsSpecification([]));
    expect(flags['--debug']).toBe(true);
    expect(client.stderr.getFullOutput()).toBe('');
  });
});

describe('getTypedOptionName', () => {
  const spec: Spec = {
    '--search': String,
    '-s': '--search',
    '--filter': [String],
    '-f': '--filter',
  };

  it.each([
    [['--search', 'a'], '--search', '--search'],
    [['-s', 'a'], '--search', '-s'],
    [['-s', 'a', '--search', 'b'], '--search', '-s'],
    [['-f', 'a', '-f', 'b'], '--filter', '-f'],
    [['--filter', 'a'], '--filter', '--filter'],
    [[], '--search', '--search'],
  ])('names the spelling typed in %j for %s', (args, name, typed) => {
    expect(getTypedOptionName(args, spec, name as `--${string}`)).toBe(typed);
  });

  it('warns about nothing', () => {
    getTypedOptionName(['-s', 'a'], spec, '--search');
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('counts a typed short flag for telemetry, once', () => {
    getTypedOptionName(['--search', 'a'], spec, '--search');
    expect(getUsedDeprecatedShorthands()).toEqual([]);

    getTypedOptionName(['-s', 'a'], spec, '--search');
    getTypedOptionName(['-s', 'a'], spec, '--search');
    expect(getUsedDeprecatedShorthands()).toEqual(['-s']);
  });
});

describe('parseWithShortFlag', () => {
  const spec = { '--output': String, '-o': '--output', '--out': String };

  it('reads the letter apart from its long option', () => {
    expect(
      parseWithShortFlag(['-o', 'a', '--output', 'b'], spec, '-o')
    ).toMatchObject({ '-o': 'a', '--output': 'b' });
  });

  it('binds the letter to another option', () => {
    expect(
      parseWithShortFlag(['-o', 'a', '--out', 'b'], spec, '-o', '--out')
    ).toMatchObject({ '--out': 'b' });
  });

  it('returns no flags when the args do not parse', () => {
    expect(parseWithShortFlag(['--output'], spec, '-o')).toEqual({});
  });
});
