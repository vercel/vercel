import { describe, expect, it } from 'vitest';
import { parseArguments } from '../../../src/util/get-args';

describe('parseArguments', () => {
  it('handles no input', () => {
    expect(parseArguments([], {})).toMatchObject({
      args: [],
      flags: {},
    });
  });

  it('handles common flags such as help', () => {
    expect(parseArguments(['--help'], {})).toMatchObject({
      args: [],
      flags: { '--help': true },
    });
  });

  it('adds arguments to the args key', () => {
    expect(parseArguments(['some', 'arguments'], {})).toMatchObject({
      args: ['some', 'arguments'],
    });
  });

  it('parses passed in basic flagsSpecification', () => {
    const args = ['--custom-flag', 'value'];
    const flagsSpecification = { '--custom-flag': String };
    expect(parseArguments(args, flagsSpecification)).toMatchObject({
      flags: { '--custom-flag': 'value' },
    });
  });

  it('parses passed in flagsSpecification with an alias', () => {
    const args = ['-c', 'value'];
    const flagsSpecification = {
      '--custom-flag': String,
      '-c': '--custom-flag',
    };
    expect(parseArguments(args, flagsSpecification)).toMatchObject({
      flags: { '--custom-flag': 'value' },
    });
  });

  it('fails when passing in a flag that is not specified', () => {
    const args = ['--nonsense'];
    expect(() => parseArguments(args, {})).toThrowErrorMatchingInlineSnapshot(
      `[ArgError: unknown or unexpected option: --nonsense]`
    );
  });

  it('succeeds when passing in a flag that is not specified in permissive mode', () => {
    const args = ['--nonsense'];
    expect(parseArguments(args, {}, { permissive: true })).toMatchObject({
      args: ['--nonsense'],
    });
  });
});
