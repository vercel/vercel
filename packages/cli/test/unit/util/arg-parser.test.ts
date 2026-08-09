import { describe, expect, it } from 'vitest';
import parse, { ArgError } from '../../../src/util/arg-parser';

const spec = {
  '--help': Boolean,
  '-h': '--help',
  '--token': String,
  '-t': '--token',
  '--debug': Boolean,
  '-d': '--debug',
  '--limit': Number,
  '--meta': [String],
  '-m': '--meta',
} as const;

const parseArgv = (argv: string[], permissive = false) =>
  parse(spec as any, { argv, permissive });

describe('arg-parser', () => {
  it('returns only positionals when no options are passed', () => {
    expect(parseArgv(['deploy', 'my-app'])).toEqual({
      _: ['deploy', 'my-app'],
    });
  });

  it('parses boolean options and their aliases', () => {
    expect(parseArgv(['--help'])).toEqual({ _: [], '--help': true });
    expect(parseArgv(['-h'])).toEqual({ _: [], '--help': true });
  });

  it('parses string options with a separate or inline value', () => {
    expect(parseArgv(['--token', 'abc'])).toEqual({ _: [], '--token': 'abc' });
    expect(parseArgv(['--token=abc'])).toEqual({ _: [], '--token': 'abc' });
    expect(parseArgv(['-t', 'abc'])).toEqual({ _: [], '--token': 'abc' });
  });

  it('coerces number options', () => {
    expect(parseArgv(['--limit', '20'])).toEqual({ _: [], '--limit': 20 });
  });

  it('allows negative numbers as values of number options', () => {
    expect(parseArgv(['--limit', '-1'])).toEqual({ _: [], '--limit': -1 });
  });

  it('collects repeatable options into an array', () => {
    expect(parseArgv(['--meta', 'a=1', '-m', 'b=2'])).toEqual({
      _: [],
      '--meta': ['a=1', 'b=2'],
    });
  });

  it('keeps the last value of a non repeatable option', () => {
    expect(parseArgv(['--token', 'a', '--token', 'b'])).toEqual({
      _: [],
      '--token': 'b',
    });
  });

  it('expands groups of short boolean options', () => {
    expect(parseArgv(['-hd'])).toEqual({
      _: [],
      '--help': true,
      '--debug': true,
    });
  });

  it('treats everything after `--` as positional', () => {
    expect(parseArgv(['dev', '--', '--debug', 'value'])).toEqual({
      _: ['dev', '--debug', 'value'],
    });
  });

  it('keeps positionals and options in any order', () => {
    expect(parseArgv(['ls', '--token', 'abc', 'project'])).toEqual({
      _: ['ls', 'project'],
      '--token': 'abc',
    });
  });

  it('throws on unknown options', () => {
    expect(() => parseArgv(['--nonsense'])).toThrowError(
      new ArgError(
        'unknown or unexpected option: --nonsense',
        'ARG_UNKNOWN_OPTION'
      )
    );
  });

  it('throws when a value is missing', () => {
    expect(() => parseArgv(['--token'])).toThrowError(
      new ArgError(
        'option requires argument: --token',
        'ARG_MISSING_REQUIRED_LONGARG'
      )
    );
  });

  it('throws when a value is missing and reports the alias used', () => {
    expect(() => parseArgv(['-t'])).toThrowError(
      new ArgError(
        'option requires argument: -t (alias for --token)',
        'ARG_MISSING_REQUIRED_LONGARG'
      )
    );
  });

  it('does not consume another option as a value', () => {
    expect(() => parseArgv(['--token', '--debug'])).toThrowError(
      new ArgError(
        'option requires argument: --token',
        'ARG_MISSING_REQUIRED_LONGARG'
      )
    );
  });

  it('throws when a short option that takes a value is not last in a group', () => {
    expect(() => parseArgv(['-td', 'value'])).toThrowError(
      new ArgError(
        'option requires argument (but was followed by another short argument): -t',
        'ARG_MISSING_REQUIRED_SHORTARG'
      )
    );
  });

  it('pushes unknown options to the positionals in permissive mode', () => {
    expect(parseArgv(['--nonsense', 'value', '--debug'], true)).toEqual({
      _: ['--nonsense', 'value'],
      '--debug': true,
    });
  });

  it('keeps the inline value of unknown options in permissive mode', () => {
    expect(parseArgv(['--nonsense=value'], true)).toEqual({
      _: ['--nonsense=value'],
    });
  });

  it('validates the specification', () => {
    expect(() => parse({ foo: String }, { argv: [] })).toThrowError(
      new ArgError(
        "argument key must start with '-' but found: 'foo'",
        'ARG_CONFIG_NONOPT_KEY'
      )
    );
    expect(() => parse({ '-foo': String }, { argv: [] })).toThrowError(
      new ArgError(
        'short argument keys (with a single hyphen) must have only one character: -foo',
        'ARG_CONFIG_SHORTOPT_TOOLONG'
      )
    );
    expect(() =>
      parse({ '--foo': 1 as unknown as StringConstructor }, { argv: [] })
    ).toThrowError(
      new ArgError(
        'type missing or not a function or valid array type: --foo',
        'ARG_CONFIG_VAD_TYPE'
      )
    );
  });
});
