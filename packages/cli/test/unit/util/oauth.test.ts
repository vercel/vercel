import { describe, it, expect, vi } from 'vitest';

vi.mock('os', async importOriginal => {
  const actual = (await importOriginal()) as typeof import('os');
  return {
    ...actual,
    hostname: vi.fn(() => 'My Machine 💻'),
  };
});

import { userAgent } from '../../../src/util/oauth';

describe('oauth userAgent', () => {
  it('should strip non-ASCII characters from hostname', () => {
    expect(userAgent).toMatch(/^[\x20-\x7e]+$/);
    expect(userAgent).not.toContain('💻');
    expect(userAgent).toContain('My Machine');
  });
});
