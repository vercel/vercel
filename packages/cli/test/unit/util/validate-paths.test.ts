import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateRootDirectory } from '../../../src/util/validate-paths';

vi.mock('../../../src/output-manager', () => ({
  default: {
    error: vi.fn(),
  },
}));

describe('validateRootDirectory', () => {
  let base: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'vc-root-'));
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
    // The sibling-prefix dir lives next to `base`, not inside it.
    rmSync(`${base}-evil`, { recursive: true, force: true });
  });

  it('accepts the project root itself', async () => {
    expect(await validateRootDirectory(base, base)).toBe(true);
  });

  it('accepts a directory inside the project root', async () => {
    const sub = join(base, 'apps', 'web');
    mkdirSync(sub, { recursive: true });
    expect(await validateRootDirectory(base, sub)).toBe(true);
  });

  it('rejects a sibling directory that shares the root as a string prefix', async () => {
    // A raw `startsWith(cwd)` would wrongly accept this.
    const sibling = `${base}-evil`;
    mkdirSync(sibling, { recursive: true });
    expect(await validateRootDirectory(base, sibling)).toBe(false);
  });

  it('rejects a path that escapes the root via ..', async () => {
    const outside = join(base, '..');
    expect(await validateRootDirectory(base, outside)).toBe(false);
  });
});
