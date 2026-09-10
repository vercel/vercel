import { describe, expect, it } from 'vitest';
import { filterDisabledEvals, isDisabledEval } from './disabled-evals';

describe('disabled evals', () => {
  it('marks every marketplace eval as disabled', () => {
    expect(isDisabledEval('marketplace/install-neon-postgres')).toBe(true);
    expect(isDisabledEval('marketplace/multi-product-install')).toBe(true);
    expect(isDisabledEval('marketplace/find-postgres-integration')).toBe(true);
    expect(isDisabledEval('marketplace/metadata-discovery')).toBe(true);
    expect(isDisabledEval('marketplace')).toBe(true);
  });

  it('does not disable other evals', () => {
    expect(isDisabledEval('build')).toBe(false);
    expect(isDisabledEval('env/add')).toBe(false);
    expect(isDisabledEval('link')).toBe(false);
    // No accidental prefix bleed onto sibling names.
    expect(isDisabledEval('marketplace-lookalike')).toBe(false);
  });

  it('filterDisabledEvals drops disabled evals even when explicitly listed', () => {
    const { allowed, dropped } = filterDisabledEvals([
      'build',
      'marketplace/install-neon-postgres',
      'env/add',
      'marketplace/multi-product-install',
    ]);
    expect(allowed).toEqual(['build', 'env/add']);
    expect(dropped).toEqual([
      'marketplace/install-neon-postgres',
      'marketplace/multi-product-install',
    ]);
  });
});
