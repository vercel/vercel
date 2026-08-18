import { describe, expect, it } from 'vitest';
import { getProvidedRuntime } from '../src/provided-runtime';
import { SUPPORTED_AL2023_RUNTIMES } from '../src/collect-build-result/validate-build-result';

describe('getProvidedRuntime()', () => {
  it('resolves to provided.al2023', async () => {
    await expect(getProvidedRuntime()).resolves.toBe('provided.al2023');
  });

  it('resolves to a runtime the build result validator accepts', async () => {
    // Custom runtimes build against this value, so it has to stay on the
    // allowlist that validateBuildResult() enforces.
    const runtime = await getProvidedRuntime();
    expect(SUPPORTED_AL2023_RUNTIMES).toContain(runtime);
  });
});
