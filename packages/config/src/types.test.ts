import { describe, expect, it } from 'vitest';
import type { FunctionConfig } from './types';

describe('FunctionConfig', () => {
  it('accepts maxConcurrency', () => {
    const config: FunctionConfig = { maxConcurrency: 8 };

    expect(config.maxConcurrency).toBe(8);
  });
});
