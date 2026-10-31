import { describe, expect, it } from 'vitest';
import {
  formatUsageAmount,
  formatUsageQuantity,
} from '../../../../src/commands/usage/format';

describe('formatUsageAmount', () => {
  it('formats USD with 2 decimal places', () => {
    expect(formatUsageAmount(1.234, 'USD')).toBe('$1.23');
    expect(formatUsageAmount(0, 'USD')).toBe('$0.00');
  });

  it('labels MIUs without a dollar sign', () => {
    expect(formatUsageAmount(1234.567, 'managed_infrastructure_units')).toBe(
      '1,234.57 MIUs'
    );
  });

  it.each([
    Number.MIN_VALUE,
    0.000001,
    0.001,
    0.0023,
    0.004,
    0.004999,
  ])('distinguishes nonzero amounts that round to zero: %s', amount => {
    expect(formatUsageAmount(amount, 'USD')).toBe('<$0.01');
    expect(formatUsageAmount(-amount, 'USD')).toBe('>-$0.01');
    expect(formatUsageAmount(amount, 'managed_infrastructure_units')).toBe(
      '<0.01 MIUs'
    );
    expect(formatUsageAmount(-amount, 'managed_infrastructure_units')).toBe(
      '>-0.01 MIUs'
    );
  });

  it.each([
    [0, '$0.00', '0 MIUs'],
    [0.005, '$0.01', '0.01 MIUs'],
    [-0.005, '$-0.01', '-0.01 MIUs'],
    [0.009, '$0.01', '0.01 MIUs'],
    [-0.009, '$-0.01', '-0.01 MIUs'],
    [0.01, '$0.01', '0.01 MIUs'],
    [-0.01, '$-0.01', '-0.01 MIUs'],
    [1.234, '$1.23', '1.23 MIUs'],
    [-1.234, '$-1.23', '-1.23 MIUs'],
  ] as const)('preserves zero and representable amounts: %s', (amount, usd, miu) => {
    expect(formatUsageAmount(amount, 'USD')).toBe(usd);
    expect(formatUsageAmount(amount, 'managed_infrastructure_units')).toBe(miu);
  });
});

describe('formatUsageQuantity', () => {
  it.each([
    [0, '0 requests'],
    [0.001, '<0.01 requests'],
    [-0.001, '>-0.01 requests'],
    [0.01, '0.01 requests'],
    [-0.01, '-0.01 requests'],
  ])('formats small custom quantities: %s', (quantity, expected) => {
    expect(
      formatUsageQuantity(quantity, 'requests', { showSmallValues: true })
    ).toBe(expected);
  });

  it('preserves compact formatting and singular units', () => {
    expect(formatUsageQuantity(1234, 'requests', { compact: true })).toBe(
      '1.23K requests'
    );
    expect(
      formatUsageQuantity(1, 'requests', { singularUnit: 'request' })
    ).toBe('1 request');
  });

  describe('digitalStorage', () => {
    it.each([
      ['byte', 'B'],
      ['kilobyte', 'KB'],
      ['megabyte', 'MB'],
      ['gigabyte', 'GB'],
      ['terabyte', 'TB'],
    ])('preserves tiny positive and negative values in %s', (unit, symbol) => {
      for (const quantity of [Number.MIN_VALUE, 0.000001, 0.001, 0.004]) {
        expect(
          formatUsageQuantity(quantity, unit, {
            unitKind: 'digitalStorage',
            showSmallValues: true,
          })
        ).toBe(`<0.01 ${symbol}`);
        expect(
          formatUsageQuantity(-quantity, unit, {
            unitKind: 'digitalStorage',
            showSmallValues: true,
          })
        ).toBe(`>-0.01 ${symbol}`);
      }
    });

    it.each([
      [0, 'byte', '0 B'],
      [0.01, 'byte', '0.01 B'],
      [-0.01, 'byte', '-0.01 B'],
      [0.125, 'byte', '0.13 B'],
      [-0.125, 'byte', '-0.13 B'],
      [999, 'byte', '999 B'],
      [1000, 'byte', '1 KB'],
      [-1000, 'byte', '-1 KB'],
      [1234.567, 'byte', '1.23 KB'],
      [-1234.567, 'byte', '-1.23 KB'],
      [1500000, 'byte', '1.5 MB'],
      [1500000000, 'byte', '1.5 GB'],
      [1500000000000, 'byte', '1.5 TB'],
      [1500, 'gigabyte', '1.5 TB'],
      [1500, 'terabyte', '1,500 TB'],
      [1, 'GIGABYTE', '1 GB'],
    ])('formats %s %s with at most 2 decimals', (quantity, unit, expected) => {
      expect(
        formatUsageQuantity(quantity, unit, {
          unitKind: 'digitalStorage',
          showSmallValues: true,
          compact: true,
        })
      ).toBe(expected);
    });

    it('preserves small-value handling for unknown storage units', () => {
      expect(
        formatUsageQuantity(0.001, 'unknown', {
          unitKind: 'digitalStorage',
          showSmallValues: true,
        })
      ).toBe('<0.01 unknown');
    });

    it('keeps small-value indicators opt-in', () => {
      expect(
        formatUsageQuantity(0.001, 'byte', { unitKind: 'digitalStorage' })
      ).toBe('0 B');
    });
  });
});
