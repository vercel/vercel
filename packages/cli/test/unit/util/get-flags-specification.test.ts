import { describe, it, expect } from 'vitest';
import type { CommandOption } from '../../../src/commands/help';
import {
  DEPRECATED_SHORTHANDS,
  getFlagsSpecification,
  getShortFlagLongName,
  getShortFlags,
  setCommandFlagsSpecification,
  type DeprecatedShorthands,
} from '../../../src/util/get-flags-specification';
import {
  limitOption,
  nextCursorOption,
  projectOption,
} from '../../../src/util/arg-common';

describe('getFlagsSpecification', () => {
  it('success - return empty object when given no options', () => {
    expect(getFlagsSpecification([])).toMatchObject({});
  });

  it('success - handles boolean options', () => {
    const options = [
      { name: 'an-option', type: Boolean, shorthand: null, deprecated: false },
      {
        name: 'another-option',
        type: Boolean,
        shorthand: null,
        deprecated: false,
      },
    ];
    expect(getFlagsSpecification(options)).toMatchObject({
      '--an-option': Boolean,
      '--another-option': Boolean,
    });
  });

  it('success - handles string options', () => {
    const options = [
      { name: 'an-option', type: String, shorthand: null, deprecated: false },
      {
        name: 'another-option',
        type: String,
        shorthand: null,
        deprecated: false,
      },
    ];
    expect(getFlagsSpecification(options)).toMatchObject({
      '--an-option': String,
      '--another-option': String,
    });
  });

  it('success - handles string array options', () => {
    const options: CommandOption[] = [
      { name: 'an-option', type: [String], shorthand: null, deprecated: false },
      {
        name: 'another-option',
        type: [String],
        shorthand: null,
        deprecated: false,
      },
    ];
    expect(getFlagsSpecification(options)).toMatchObject({
      '--an-option': [String],
      '--another-option': [String],
    });
  });

  it('success - handles number options', () => {
    const options = [
      { name: 'an-option', type: Number, shorthand: null, deprecated: false },
      {
        name: 'another-option',
        type: Number,
        shorthand: null,
        deprecated: false,
      },
    ];
    expect(getFlagsSpecification(options)).toMatchObject({
      '--an-option': Number,
      '--another-option': Number,
    });
  });

  it('success - handles options of multiple types', () => {
    const options: CommandOption[] = [
      { name: 'an-option', type: Boolean, shorthand: null, deprecated: false },
      {
        name: 'another-option',
        type: String,
        shorthand: null,
        deprecated: false,
      },
      {
        name: 'third-option',
        type: Number,
        shorthand: null,
        deprecated: false,
      },
      {
        name: 'fourth-option',
        type: [String],
        shorthand: null,
        deprecated: false,
      },
    ];
    expect(getFlagsSpecification(options)).toMatchObject({
      '--an-option': Boolean,
      '--another-option': String,
      '--third-option': Number,
      '--fourth-option': [String],
    });
  });

  it('success - handles shortname', () => {
    const options: CommandOption[] = [
      { name: 'an-option', type: Boolean, shorthand: 'a', deprecated: false },
    ];
    expect(getFlagsSpecification(options)).toMatchObject({
      '--an-option': Boolean,
      '-a': '--an-option',
    });
  });
});

describe('getFlagsSpecification -N', () => {
  it('keeps the hidden -N as an alias of --next', () => {
    const spec = getFlagsSpecification([nextCursorOption]);
    expect(spec).toMatchObject({ '--next': String, '-N': '--next' });
    expect(nextCursorOption.shorthand).toBeNull();
  });

  it('adds no -N to commands without --next', () => {
    const spec = getFlagsSpecification([
      { name: 'limit', type: Number, shorthand: null, deprecated: false },
    ]) as Record<string, unknown>;
    expect(spec['-N']).toBeUndefined();
  });
});

describe('getFlagsSpecification deprecatedShorthand', () => {
  const description: CommandOption = {
    name: 'description',
    type: String,
    shorthand: null,
    deprecatedShorthand: 'd',
    deprecated: false,
  };

  it('keeps the hidden letter as an alias of the long name', () => {
    expect(getFlagsSpecification([description])).toMatchObject({
      '--description': String,
      '-d': '--description',
    });
  });

  it('lists the hidden letters, so parseArguments can warn', () => {
    const spec = getFlagsSpecification([
      description,
      nextCursorOption,
      { name: 'yes', type: Boolean, shorthand: 'y', deprecated: false },
    ]) as DeprecatedShorthands;
    expect(spec[DEPRECATED_SHORTHANDS]).toEqual(['-d', '-N']);
  });

  it('lists a letter once when options repeat', () => {
    const spec = getFlagsSpecification([
      description,
      description,
    ]) as DeprecatedShorthands;
    expect(spec[DEPRECATED_SHORTHANDS]).toEqual(['-d']);
  });

  it('keeps the list out of the keys the parser reads', () => {
    expect(Object.keys(getFlagsSpecification([description]))).toEqual([
      '--description',
      '-d',
    ]);
  });

  it('survives combining specs with a spread', () => {
    const spec = {
      ...getFlagsSpecification([description]),
      '-j': '--json',
    } as DeprecatedShorthands;
    expect(spec[DEPRECATED_SHORTHANDS]).toEqual(['-d']);
  });

  it('adds no list when nothing is hidden', () => {
    const spec = getFlagsSpecification([
      { name: 'yes', type: Boolean, shorthand: 'y', deprecated: false },
    ]) as DeprecatedShorthands;
    expect(spec[DEPRECATED_SHORTHANDS]).toBeUndefined();
  });
});

describe('getShortFlags', () => {
  it('returns the shown and hidden short flags', () => {
    expect(
      getShortFlags({
        name: 'limit',
        type: Number,
        shorthand: 'n',
        deprecatedShorthand: 'l',
        deprecated: false,
      })
    ).toEqual(['-n', '-l']);
    expect(
      getShortFlags({
        name: 'json',
        type: Boolean,
        shorthand: null,
        deprecated: false,
      })
    ).toEqual([]);
  });
});

describe('getShortFlagLongName', () => {
  it('reads -p and -n as --project and --limit before any command parse', () => {
    expect(getShortFlagLongName('-p')).toBe('--project');
    expect(getShortFlagLongName('-yp')).toBe('--project');
    expect(getShortFlagLongName('-n')).toBe('--limit');
    expect(getShortFlagLongName('-pn')).toBe('--limit');
    expect(getShortFlagLongName('-py')).toBeUndefined();
    expect(getShortFlagLongName('-e')).toBeUndefined();
    expect(getShortFlagLongName('--project')).toBeUndefined();
  });

  it('follows the meaning the running command gives the letter', () => {
    try {
      setCommandFlagsSpecification(
        getFlagsSpecification([projectOption, limitOption])
      );
      expect(getShortFlagLongName('-p')).toBe('--project');
      expect(getShortFlagLongName('-n')).toBe('--limit');

      setCommandFlagsSpecification(
        getFlagsSpecification([
          {
            name: 'position',
            shorthand: null,
            deprecatedShorthand: 'p',
            type: Number,
            deprecated: false,
          },
        ])
      );
      expect(getShortFlagLongName('-p')).toBeUndefined();
      expect(getShortFlagLongName('-n')).toBeUndefined();
    } finally {
      setCommandFlagsSpecification(undefined);
    }
  });

  it('reads an explicit specification', () => {
    expect(
      getShortFlagLongName('-n', { '--name': String, '-n': '--name' })
    ).toBeUndefined();
    expect(
      getShortFlagLongName('-n', getFlagsSpecification([limitOption]))
    ).toBe('--limit');
  });
});
