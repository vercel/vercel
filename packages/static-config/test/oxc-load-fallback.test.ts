import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/load-oxc', () => ({
  loadOxcParser: () => {
    throw Object.assign(
      new Error("require() of ES Module 'oxc-parser' not supported"),
      { code: 'ERR_REQUIRE_ESM' }
    );
  },
}));

import { getConfig } from '../src';

const tempDir = mkdtempSync(join(tmpdir(), 'static-config-oxc-load-'));

afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

describe('oxc-parser load failure', () => {
  it('falls back to ts-morph and records a load error on the span', () => {
    const attributes: Record<string, string | undefined> = {};
    const span = {
      child: (_name: string, attrs?: Record<string, string | undefined>) => {
        Object.assign(attributes, attrs);
        return span;
      },
      setAttributes: (attrs: Record<string, string | undefined>) => {
        Object.assign(attributes, attrs);
      },
      stop: () => {},
    };

    const sourcePath = join(tempDir, 'config.ts');
    writeFileSync(sourcePath, `export const config = { runtime: 'edge' }`);

    expect(getConfig(null, sourcePath, {} as const, span)).toEqual({
      runtime: 'edge',
    });
    expect(attributes).toMatchObject({
      'static_config.parser': 'ts-morph',
      'static_config.fallback': 'true',
      'static_config.oxc_error': 'load',
      'static_config.oxc_error_code': 'ERR_REQUIRE_ESM',
      'static_config.outcome': 'found',
    });
    expect(attributes['static_config.oxc_error_message']).toContain(
      'ES Module'
    );
  });
});
