import { describe, test, expect } from 'vitest';
import manifest from '../src/frameworks.json';

/**
 * TEMPORARY regression guardrail.
 *
 * This snapshot pins the exact contents of the committed `frameworks.json`
 * manifest as of today. Its sole purpose is to catch drift when a future
 * step sources the manifest from the frameworks API at build time: if any
 * entry shifts (added, removed, reordered, or a field changes) the snapshot
 * diff will surface it, and updating it will require an explicit `-u`.
 *
 * Once build-time API sourcing lands and is trusted, this file (and its
 * snapshot) can be deleted.
 */
describe('frameworks.json manifest (temporary drift guard)', () => {
  test('manifest matches the committed snapshot', () => {
    expect(manifest).toMatchSnapshot();
  });
});
