import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Framework, FunctionConfig, VercelConfig } from './types';

describe('FunctionConfig', () => {
  it('accepts maxConcurrency', () => {
    const config: FunctionConfig = { maxConcurrency: 8 };

    expect(config.maxConcurrency).toBe(8);
  });
});

describe('Framework', () => {
  it('accepts the Eve framework in project configuration', () => {
    const config = { framework: 'eve' } satisfies VercelConfig;

    expectTypeOf(config.framework).toExtend<Framework>();
    expectTypeOf<'not-a-framework'>().not.toExtend<Framework>();
    expect(config.framework).toBe('eve');
  });
});
