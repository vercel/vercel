import { createHash } from 'node:crypto';
import { type fs, vol } from 'memfs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', async () => {
  const memfs: { fs: typeof fs } = await vi.importActual('memfs');
  return memfs.fs.promises;
});

import _fetch, { type Response } from 'node-fetch';

const fetch = vi.mocked(_fetch);
vi.mock('node-fetch', async () => ({
  ...(await vi.importActual('node-fetch')),
  default: vi.fn(),
}));

import * as fsp from 'node:fs/promises';
import { emitFlagsDefinitions } from '../../../../src/commands/build/emit-flags-definitions';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function mockFetchResponse(data: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'Internal Server Error',
    json: async () => data,
  } as unknown as Response;
}

beforeEach(() => {
  vi.resetAllMocks();
  vol.reset();
});

describe('emitFlagsDefinitions', () => {
  it('should do nothing when no SDK keys are present', async () => {
    const writeFileSpy = vi.spyOn(fsp, 'writeFile');
    const mkdirSpy = vi.spyOn(fsp, 'mkdir');

    await emitFlagsDefinitions('/app', {
      SOME_VAR: 'hello',
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(mkdirSpy).not.toHaveBeenCalled();
    expect(writeFileSpy).not.toHaveBeenCalled();
    expect(vol.toJSON()).toEqual({});

    writeFileSpy.mockRestore();
    mkdirSpy.mockRestore();
  });

  it('should fetch definitions for a direct vf_ key and write files', async () => {
    const sdkKey = 'vf_test_abc123def456';
    const definitions = { flag1: { variants: ['on', 'off'] } };

    fetch.mockResolvedValueOnce(mockFetchResponse(definitions));

    await emitFlagsDefinitions('/app', {
      FLAGS_SECRET: sdkKey,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://flags.vercel.com/v1/datafile',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: `Bearer ${sdkKey}`,
        }),
      })
    );

    const files = vol.toJSON();
    const storageDir = '/app/node_modules/@vercel/flags-definitions';

    // index.js should exist and use hashed key
    const indexJs = files[`${storageDir}/index.js`] as string;
    expect(indexJs).toBeDefined();
    expect(indexJs).toContain(sha256(sdkKey));
    expect(indexJs).not.toContain(sdkKey);
    expect(indexJs).toContain('export function get(hashedSdkKey)');

    // index.d.ts should exist
    const dts = files[`${storageDir}/index.d.ts`] as string;
    expect(dts).toContain('export function get(hashedSdkKey: string)');

    // package.json should exist
    const packageJson = JSON.parse(
      files[`${storageDir}/package.json`] as string
    );
    expect(packageJson.name).toBe('@vercel/flags-definitions');
  });

  it('should extract SDK key from flags: format', async () => {
    const sdkKey = 'vf_flags_format_key';
    const definitions = { flag1: {} };

    fetch.mockResolvedValueOnce(mockFetchResponse(definitions));

    await emitFlagsDefinitions('/app', {
      MY_FLAG_VAR: `flags:sdkKey=${sdkKey}&other=value`,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://flags.vercel.com/v1/datafile',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: `Bearer ${sdkKey}`,
        }),
      })
    );
  });

  it('should deduplicate SDK keys across env vars', async () => {
    const sdkKey = 'vf_duplicate_key';
    const definitions = { flag1: {} };

    fetch.mockResolvedValueOnce(mockFetchResponse(definitions));

    await emitFlagsDefinitions('/app', {
      VAR1: sdkKey,
      VAR2: sdkKey,
      VAR3: `flags:sdkKey=${sdkKey}`,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple distinct SDK keys', async () => {
    const key1 = 'vf_key_one_abcdef';
    const key2 = 'vf_key_two_ghijkl';
    const defs1 = { flagA: { enabled: true } };
    const defs2 = { flagB: { enabled: false } };

    fetch
      .mockResolvedValueOnce(mockFetchResponse(defs1))
      .mockResolvedValueOnce(mockFetchResponse(defs2));

    await emitFlagsDefinitions('/app', {
      VAR1: key1,
      VAR2: key2,
    });

    expect(fetch).toHaveBeenCalledTimes(2);

    const files = vol.toJSON();
    const indexJs = files[
      '/app/node_modules/@vercel/flags-definitions/index.js'
    ] as string;

    // Both hashed keys should be present, raw keys should not
    expect(indexJs).toContain(sha256(key1));
    expect(indexJs).toContain(sha256(key2));
    expect(indexJs).not.toContain(key1);
    expect(indexJs).not.toContain(key2);
  });

  it('should deduplicate identical definitions across keys', async () => {
    const key1 = 'vf_key_one_abcdef';
    const key2 = 'vf_key_two_ghijkl';
    const sameDefs = { flagA: { enabled: true } };

    fetch
      .mockResolvedValueOnce(mockFetchResponse(sameDefs))
      .mockResolvedValueOnce(mockFetchResponse(sameDefs));

    await emitFlagsDefinitions('/app', {
      VAR1: key1,
      VAR2: key2,
    });

    const files = vol.toJSON();
    const indexJs = files[
      '/app/node_modules/@vercel/flags-definitions/index.js'
    ] as string;

    // Only one _d0 constant should exist (deduplicated)
    expect(indexJs).toContain('const _d0');
    expect(indexJs).not.toContain('const _d1');

    // Both hashed keys map to _d0
    expect(indexJs).toContain(`${JSON.stringify(sha256(key1))}: _d0`);
    expect(indexJs).toContain(`${JSON.stringify(sha256(key2))}: _d0`);
  });

  it('should produce a valid module structure', async () => {
    const sdkKey = 'vf_structure_test_key_123';
    const definitions = { myFlag: { variants: ['a', 'b'] } };

    fetch.mockResolvedValueOnce(mockFetchResponse(definitions));

    await emitFlagsDefinitions('/app', {
      SDK_KEY: sdkKey,
    });

    const files = vol.toJSON();
    const indexJs = files[
      '/app/node_modules/@vercel/flags-definitions/index.js'
    ] as string;

    const hashedKey = sha256(sdkKey);

    // Map entry uses hashed key pointing to _d0
    expect(indexJs).toContain(`"${hashedKey}": _d0`);

    // _d0 contains the JSON-serialized definitions
    expect(indexJs).toContain(
      `const _d0 = memo(() => JSON.parse(${JSON.stringify(JSON.stringify(definitions))}));`
    );

    // Lookup function uses the hashed key parameter
    expect(indexJs).toContain(
      'export function get(hashedSdkKey) {\n  return map[hashedSdkKey]?.() ?? null;\n}'
    );

    // Raw key must not appear
    expect(indexJs).not.toContain(sdkKey);

    // Version is included
    expect(indexJs).toContain('export const version = "1.0.0"');
  });

  it('should include Vercel metadata headers when env vars are set', async () => {
    const sdkKey = 'vf_meta_key_test';

    fetch.mockResolvedValueOnce(mockFetchResponse({}));

    await emitFlagsDefinitions('/app', {
      MY_KEY: sdkKey,
      VERCEL_PROJECT_ID: 'prj_123',
      VERCEL_ENV: 'production',
      VERCEL_DEPLOYMENT_ID: 'dpl_456',
      VERCEL_REGION: 'iad1',
    });

    expect(fetch).toHaveBeenCalledWith(
      'https://flags.vercel.com/v1/datafile',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-vercel-project-id': 'prj_123',
          'x-vercel-env': 'production',
          'x-vercel-deployment-id': 'dpl_456',
          'x-vercel-region': 'iad1',
        }),
      })
    );
  });

  it('should throw NowBuildError when fetch fails', async () => {
    const sdkKey = 'vf_fail_key_abcdef123';

    fetch.mockResolvedValueOnce(mockFetchResponse(null, false));

    await expect(emitFlagsDefinitions('/app', { KEY: sdkKey })).rejects.toThrow(
      'Failed to fetch flag definitions'
    );
  });

  it('should ignore env vars that do not contain SDK keys', async () => {
    await emitFlagsDefinitions('/app', {
      HOME: '/home/user',
      PATH: '/usr/bin',
      NODE_ENV: 'production',
      FLAGS_VAR: 'flags:other=value',
      PARTIAL: 'flags:sdkKey=not_vf_prefix',
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it('should write version field in the generated module', async () => {
    fetch.mockResolvedValueOnce(mockFetchResponse({}));

    await emitFlagsDefinitions('/app', {
      KEY: 'vf_version_test',
    });

    const files = vol.toJSON();
    const indexJs = files[
      '/app/node_modules/@vercel/flags-definitions/index.js'
    ] as string;
    expect(indexJs).toContain('export const version = "1.0.0"');
  });
});
