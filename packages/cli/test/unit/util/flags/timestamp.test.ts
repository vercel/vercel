import { describe, expect, it } from 'vitest';
import { isBucketingAttribute } from '../../../../src/util/flags/attribute-types';
import {
  coerceTimestampCondition,
  parseTimestampInput,
  validateTimestampEpochMs,
} from '../../../../src/util/flags/timestamp';
import { defaultFlagSettings } from '../../../mocks/flags';

describe('isBucketingAttribute', () => {
  it('rejects timestamp attributes', () => {
    expect(isBucketingAttribute({ type: 'timestamp' })).toEqual(false);
    expect(isBucketingAttribute({ type: 'string' })).toEqual(true);
  });
});

describe('parseTimestampInput', () => {
  it('parses epoch milliseconds', () => {
    expect(parseTimestampInput('1713258000000')).toEqual(1713258000000);
  });

  it('parses ISO 8601 UTC', () => {
    expect(parseTimestampInput('2026-04-16T09:00:00.000Z')).toEqual(
      Date.parse('2026-04-16T09:00:00.000Z')
    );
  });

  it('parses ISO 8601 with a minute-precision time and offset', () => {
    expect(parseTimestampInput('2026-04-16T09:00+02:00')).toEqual(
      Date.parse('2026-04-16T09:00:00+02:00')
    );
  });

  it('parses ISO 8601 without a timezone as local time', () => {
    expect(parseTimestampInput('2026-04-16T09:00:00')).toEqual(
      Date.parse('2026-04-16T09:00:00')
    );
  });

  it('rejects invalid calendar dates that Date.parse would overflow', () => {
    expect(() => parseTimestampInput('2026-02-29T09:00:00Z')).toThrow(
      /Invalid timestamp/
    );
    expect(() => parseTimestampInput('2026-04-31T09:00:00')).toThrow(
      /Invalid timestamp/
    );
    expect(() => parseTimestampInput('2026-04-16T24:00:00Z')).toThrow(
      /Invalid timestamp/
    );
  });

  it('accepts a leap-day that exists', () => {
    expect(parseTimestampInput('2024-02-29T09:00:00Z')).toEqual(
      Date.parse('2024-02-29T09:00:00Z')
    );
  });

  it('rejects date-only input', () => {
    expect(() => parseTimestampInput('2026-04-16')).toThrow(
      /ISO 8601 date and time/
    );
  });

  it('rejects year and month-only input', () => {
    expect(() => parseTimestampInput('2026')).toThrow(/Invalid timestamp/);
    expect(() => parseTimestampInput('2026-04')).toThrow(/Invalid timestamp/);
  });

  it('rejects epoch seconds', () => {
    expect(() => parseTimestampInput('1776297600')).toThrow(
      /milliseconds, not seconds or years/
    );
  });

  it('rejects arbitrary strings', () => {
    expect(() => parseTimestampInput('next-week')).toThrow(/Invalid timestamp/);
  });
});

describe('validateTimestampEpochMs', () => {
  it('accepts plausible epoch milliseconds', () => {
    expect(validateTimestampEpochMs(1776297600000)).toEqual(1776297600000);
  });

  it('rejects values too small to be epoch milliseconds', () => {
    expect(() => validateTimestampEpochMs(2026)).toThrow(
      /milliseconds, not seconds or years/
    );
    expect(() => validateTimestampEpochMs(1776297600)).toThrow(
      /milliseconds, not seconds or years/
    );
  });
});

describe('parseTimestampInput historical ISO', () => {
  it('accepts pre-2001 ISO instants that digit input rejects', () => {
    const epochMs = Date.parse('1999-01-01T00:00:00.000Z');
    expect(epochMs).toBeLessThan(1e12);
    expect(parseTimestampInput('1999-01-01T00:00:00.000Z')).toEqual(epochMs);
    expect(() => parseTimestampInput(String(epochMs))).toThrow(
      /milliseconds, not seconds or years/
    );
  });
});

describe('coerceTimestampCondition', () => {
  it('converts ISO date/time on timestamp attributes to epoch milliseconds', () => {
    const condition = coerceTimestampCondition(
      {
        lhs: { type: 'entity', kind: 'user', attribute: 'signupAt' },
        cmp: 'gt',
        rhs: '2026-04-16T09:00:00.000Z',
      },
      defaultFlagSettings
    );

    expect(condition).toMatchObject({
      cmp: 'gt',
      rhs: Date.parse('2026-04-16T09:00:00.000Z'),
    });
  });

  it('rejects digit-string years and seconds on timestamp attributes', () => {
    expect(() =>
      coerceTimestampCondition(
        {
          lhs: { type: 'entity', kind: 'user', attribute: 'signupAt' },
          cmp: 'gt',
          rhs: '2026',
        },
        defaultFlagSettings,
        'input'
      )
    ).toThrow(/Invalid timestamp/);
    expect(() =>
      coerceTimestampCondition(
        {
          lhs: { type: 'entity', kind: 'user', attribute: 'signupAt' },
          cmp: 'gt',
          rhs: '1776297600',
        },
        defaultFlagSettings,
        'input'
      )
    ).toThrow(/milliseconds, not seconds or years/);
  });

  it('rejects numeric years and seconds promoted from user input', () => {
    expect(() =>
      coerceTimestampCondition(
        {
          lhs: { type: 'entity', kind: 'user', attribute: 'signupAt' },
          cmp: 'gt',
          rhs: 2026,
        },
        defaultFlagSettings,
        'input'
      )
    ).toThrow(/milliseconds, not seconds or years/);
    expect(() =>
      coerceTimestampCondition(
        {
          lhs: { type: 'entity', kind: 'user', attribute: 'signupAt' },
          cmp: 'gt',
          rhs: 1776297600,
        },
        defaultFlagSettings,
        'input'
      )
    ).toThrow(/milliseconds, not seconds or years/);
  });

  it('re-coerces stored pre-2001 epoch milliseconds without throwing', () => {
    const epochMs = Date.parse('1999-01-01T00:00:00.000Z');
    const condition = coerceTimestampCondition(
      {
        lhs: { type: 'entity', kind: 'user', attribute: 'signupAt' },
        cmp: 'gt',
        rhs: epochMs,
      },
      defaultFlagSettings,
      'stored'
    );

    expect(condition.rhs).toEqual(epochMs);
  });

  it('converts list values on timestamp attributes', () => {
    const condition = coerceTimestampCondition(
      {
        lhs: { type: 'entity', kind: 'user', attribute: 'signupAt' },
        cmp: 'oneOf',
        rhs: {
          type: 'list',
          items: [{ value: '2026-04-16T09:00:00Z' }, { value: 1776297600000 }],
        },
      },
      defaultFlagSettings
    );

    expect(condition.rhs).toEqual({
      type: 'list',
      items: [
        { value: Date.parse('2026-04-16T09:00:00Z') },
        { value: 1776297600000 },
      ],
    });
  });

  it('rejects string operators on timestamp attributes', () => {
    expect(() =>
      coerceTimestampCondition(
        {
          lhs: { type: 'entity', kind: 'user', attribute: 'signupAt' },
          cmp: 'contains',
          rhs: '2026',
        },
        defaultFlagSettings
      )
    ).toThrow(/not valid for Timestamp attribute user\.signupAt/);
  });

  it('leaves string attributes unchanged', () => {
    const condition = coerceTimestampCondition(
      {
        lhs: { type: 'entity', kind: 'user', attribute: 'plan' },
        cmp: 'eq',
        rhs: '2026-04-16T09:00:00.000Z',
      },
      defaultFlagSettings
    );

    expect(condition.rhs).toEqual('2026-04-16T09:00:00.000Z');
  });

  it('leaves attributes not declared in settings unchanged', () => {
    const condition = coerceTimestampCondition(
      {
        lhs: { type: 'entity', kind: 'user', attribute: 'appVersion' },
        cmp: 'gt',
        rhs: '1.2.3',
      },
      defaultFlagSettings
    );

    expect(condition.rhs).toEqual('1.2.3');
  });
});
