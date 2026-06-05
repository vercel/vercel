import { afterEach, describe, expect, it } from 'vitest';
import {
  ALLOW_EXTENDED_MAX_DURATION_ENV,
  DEFAULT_MAX_DURATION_LIMIT,
  getMaxDurationLimit,
  getMaxDurationSchema,
} from '../src/max-duration';

describe('getMaxDurationLimit', () => {
  afterEach(() => {
    delete process.env[ALLOW_EXTENDED_MAX_DURATION_ENV];
  });

  it('returns the default 900s limit when the flag is unset', () => {
    expect(getMaxDurationLimit()).toBe(DEFAULT_MAX_DURATION_LIMIT);
    expect(DEFAULT_MAX_DURATION_LIMIT).toBe(900);
  });

  it('returns undefined (no client-side limit) when the flag is enabled', () => {
    process.env[ALLOW_EXTENDED_MAX_DURATION_ENV] = '1';
    expect(getMaxDurationLimit()).toBeUndefined();
  });

  it('only opts out for the exact value "1"', () => {
    process.env[ALLOW_EXTENDED_MAX_DURATION_ENV] = 'true';
    expect(getMaxDurationLimit()).toBe(DEFAULT_MAX_DURATION_LIMIT);
  });
});

describe('getMaxDurationSchema', () => {
  afterEach(() => {
    delete process.env[ALLOW_EXTENDED_MAX_DURATION_ENV];
  });

  it('includes a 900 maximum on the integer branch by default', () => {
    const schema = getMaxDurationSchema();
    expect(schema).toEqual({
      oneOf: [
        { type: 'integer', minimum: 1, maximum: 900 },
        { type: 'string', enum: ['max'] },
      ],
    });
  });

  it('omits the maximum (but keeps minimum/integer) when the flag is enabled', () => {
    process.env[ALLOW_EXTENDED_MAX_DURATION_ENV] = '1';
    const schema = getMaxDurationSchema();
    expect(schema).toEqual({
      oneOf: [
        { type: 'integer', minimum: 1 },
        { type: 'string', enum: ['max'] },
      ],
    });
    const integerBranch = schema.oneOf[0] as Record<string, unknown>;
    expect(integerBranch).not.toHaveProperty('maximum');
  });
});
