import { describe, expect, it } from 'vitest';
import { commandsStructs } from '../../../src/commands';
import { segmentsSubcommand } from '../../../src/commands/flags/command';
import {
  findCommandShorthands,
  findHiddenShorthandOption,
} from '../../../src/util/command-shorthands';
import { parseArguments } from '../../../src/util/get-args';

function found(...argv: string[]) {
  return [...findCommandShorthands(commandsStructs, argv)];
}

describe('findCommandShorthands', () => {
  it.each([
    [['flags', 'create', 'checkout', '-d', 'Checkout flow'], [3]],
    [['flags', 'add', 'checkout', '-d', 'Checkout flow'], [3]],
    [['flags', 'create', 'checkout', '--kind', 'string', '-d', 'x'], [5]],
    [
      ['flags', 'create', 'checkout', '-d', 'a', '-d', 'b'],
      [3, 5],
    ],
    [['--scope', 'acme', 'flags', 'create', 'checkout', '-d', 'x'], [5]],
    [['flags', 'segments', 'create', 'beta', '-d', 'Beta users'], [4]],
    [['flags', 'segments', 'update', 'beta', '-d', 'Beta users'], [4]],
  ])('leaves -d to the command in %j', (argv, indexes) => {
    expect(found(...argv)).toEqual(indexes);
  });

  it.each([
    // Before the command's required arguments, the value is the argument.
    [['flags', 'create', '-d', 'checkout']],
    // No value follows.
    [['flags', 'create', 'checkout', '-d']],
    [['flags', 'create', 'checkout', '-d', '--kind', 'string']],
    // Grouped letters keep today's behavior.
    [['flags', 'create', 'checkout', '-hd', 'x']],
    // Before the subcommand, or for a command without a hidden -d.
    [['flags', '-d', 'x', 'create', 'checkout']],
    [['flags', 'update', 'checkout', '-d', 'x']],
    [['env', 'ls', 'production', '-d', 'x']],
    // A value of another option, or after `--`.
    [['flags', 'create', 'checkout', '--scope', '-d', 'x']],
    [['flags', 'create', 'checkout', '--', '-d', 'x']],
    // `-v` and `-t` stay global.
    [['flags', 'create', 'checkout', '-v', 'alpha']],
    [['blob', 'put', 'f.txt', '-t', 'text/plain']],
  ])('keeps -d global in %j', argv => {
    expect(found(...argv)).toEqual([]);
  });

  it('starts from a group', () => {
    expect([
      ...findCommandShorthands(segmentsSubcommand.subcommands, [
        'create',
        'beta',
        '-d',
        'Beta users',
      ]),
    ]).toEqual([2]);
  });

  it('counts from `start`', () => {
    expect([
      ...findCommandShorthands(
        commandsStructs,
        ['node', 'vc', 'flags', 'create', 'checkout', '-d', 'x'],
        2
      ),
    ]).toEqual([5]);
  });
});

describe('findHiddenShorthandOption', () => {
  it('finds the option that keeps -t as its hidden letter', () => {
    for (const command of ['put', 'copy']) {
      expect(
        findHiddenShorthandOption(
          commandsStructs,
          ['blob', command, 'a.txt', '-t', 'text/plain'],
          '-t'
        )?.name
      ).toBe('content-type');
    }
  });

  it('finds nothing when the flag is the long name or another command', () => {
    expect(
      findHiddenShorthandOption(
        commandsStructs,
        ['blob', 'put', 'f.txt', '--token', 'a/b'],
        '-t'
      )
    ).toBeUndefined();
    expect(
      findHiddenShorthandOption(
        commandsStructs,
        ['env', 'ls', '-t', 'a/b'],
        '-t'
      )
    ).toBeUndefined();
  });
});

describe('parseArguments with commandShorthands', () => {
  const rootSpec = { '--version': Boolean, '-v': '--version' } as const;

  it('leaves the command its -d and the value, in order', () => {
    const argv = [
      'node',
      'vc',
      'flags',
      'create',
      'checkout',
      '-d',
      'Checkout flow',
      '--kind',
      'boolean',
    ];
    const { args, flags } = parseArguments(argv, rootSpec, {
      permissive: true,
      commandShorthands: findCommandShorthands(commandsStructs, argv, 2),
    });
    expect(flags['--debug']).toBeUndefined();
    expect(args).toEqual([
      'node',
      'vc',
      'flags',
      'create',
      'checkout',
      '-d',
      'Checkout flow',
      '--kind',
      'boolean',
    ]);
  });

  it('keeps -d as --debug everywhere else', () => {
    const argv = ['node', 'vc', 'flags', 'create', '-d', 'checkout'];
    const { args, flags } = parseArguments(argv, rootSpec, {
      permissive: true,
      commandShorthands: findCommandShorthands(commandsStructs, argv, 2),
    });
    expect(flags['--debug']).toBe(true);
    expect(args).toEqual(['node', 'vc', 'flags', 'create', 'checkout']);
  });

  it('ignores commandShorthands in a strict parse', () => {
    const { flags } = parseArguments(
      ['-d'],
      {},
      {
        commandShorthands: new Set([0]),
      }
    );
    expect(flags['--debug']).toBe(true);
  });
});
