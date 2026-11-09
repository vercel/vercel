import { describe, expect, it } from 'vitest';
import { getProvidedRuntime } from '../src/provided-runtime';

describe('getProvidedRuntime()', () => {
  it('resolves to provided.al2023', async () => {
    await expect(getProvidedRuntime()).resolves.toBe('provided.al2023');
  });
});
