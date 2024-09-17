import { describe, it, expect } from 'vitest';
import { CommandOption } from '../../../src/commands/help';
import { getFlagsSpecification } from '../../../src/util/get-flags-specification';

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
