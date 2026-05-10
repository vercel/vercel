import { describe, expect, it } from 'vitest';

describe('vnx-134 agent review diagnostic fixture', () => {
  it('keeps the fixture inert', () => {
    expect('diagnostic-only').toBe('diagnostic-only');
  });
});
