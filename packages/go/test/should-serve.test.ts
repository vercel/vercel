import { describe, expect, it } from 'vitest';
import { shouldServe } from '../src/index';
import type { ShouldServeOptions } from '@vercel/build-utils';

function makeOptions(
  overrides: Partial<ShouldServeOptions>
): ShouldServeOptions {
  return {
    entrypoint: 'main.go',
    files: {},
    workPath: '/tmp',
    config: {},
    requestPath: '',
    ...overrides,
  } as ShouldServeOptions;
}

describe('shouldServe', () => {
  describe('standalone server mode (framework: go)', () => {
    const config = { framework: 'go' };

    it('serves the root path', async () => {
      expect(await shouldServe(makeOptions({ config, requestPath: '' }))).toBe(
        true
      );
    });

    it('serves arbitrary paths', async () => {
      expect(
        await shouldServe(makeOptions({ config, requestPath: 'some/path' }))
      ).toBe(true);
    });

    it('serves api paths', async () => {
      expect(
        await shouldServe(makeOptions({ config, requestPath: 'api/hello' }))
      ).toBe(true);
    });
  });

  describe('standalone server mode (framework: services)', () => {
    it('serves arbitrary paths', async () => {
      expect(
        await shouldServe(
          makeOptions({
            config: { framework: 'services' },
            requestPath: 'some/path',
          })
        )
      ).toBe(true);
    });
  });

  describe('serverless function mode (no framework)', () => {
    it('serves only the entrypoint path', async () => {
      const files = { 'api/index.go': {} as any };
      expect(
        await shouldServe(
          makeOptions({
            entrypoint: 'api/index.go',
            files,
            requestPath: 'api/index.go',
          })
        )
      ).toBe(true);
      expect(
        await shouldServe(
          makeOptions({
            entrypoint: 'api/index.go',
            files,
            requestPath: 'some/other/path',
          })
        )
      ).toBe(false);
    });
  });
});
