import { describe, expect, it } from 'vitest';
import {
  hasFunctionsBetaOptIn,
  parseFunctionsBetaOptIns,
} from '../src/functions-beta';

describe('functions beta opt-ins', () => {
  it('parses comma-separated opt-ins', () => {
    expect(parseFunctionsBetaOptIns('alpha, beta,gamma')).toEqual(
      new Set(['alpha', 'beta', 'gamma'])
    );
  });

  it('ignores empty entries and whitespace', () => {
    expect(parseFunctionsBetaOptIns(' alpha, , beta ,, ')).toEqual(
      new Set(['alpha', 'beta'])
    );
  });

  it('checks arbitrary opt-ins from VERCEL_FUNCTIONS_BETA', () => {
    expect(
      hasFunctionsBetaOptIn({ VERCEL_FUNCTIONS_BETA: 'alpha, beta' }, 'beta')
    ).toBe(true);
  });

  it('checks opt-ins with dated names', () => {
    expect(
      hasFunctionsBetaOptIn(
        { VERCEL_FUNCTIONS_BETA: 'alpha, large-function-opt-2026-06' },
        'large-function-opt-2026-06'
      )
    ).toBe(true);
  });
});
