import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * TEMPORARY regression guardrail.
 *
 * This snapshot pins the exact contents of the framework manifest that
 * `build.mjs` fetched from the frameworks API and wrote to
 * `dist/frameworks.json`. Its purpose is to catch drift in the API-sourced
 * data: if any entry shifts (added, removed, reordered, or a field changes)
 * the snapshot diff will surface it, and updating it requires an explicit
 * `-u`.
 *
 * Reads the built artifact (tests run after `build` in turbo), so it stays
 * offline. Once API sourcing is fully trusted, this file (and its snapshot)
 * can be deleted.
 */
const manifest = JSON.parse(
  readFileSync(join(__dirname, '..', 'dist', 'frameworks.json'), 'utf8')
);

describe('frameworks.json manifest (temporary drift guard)', () => {
  test('manifest matches the committed snapshot', () => {
    expect(manifest).toMatchSnapshot();
  });
});
