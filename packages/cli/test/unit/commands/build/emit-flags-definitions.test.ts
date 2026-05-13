import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareFlagsDefinitions } from '@vercel/prepare-flags-definitions';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function mockFetch(responses: Array<{ data: unknown; ok?: boolean }>) {
  let callIndex = 0;
  const fn = vi.fn(async () => {
    const response = responses[callIndex++];
    const ok = response?.ok ?? true;
    return {
      ok,
      status: ok ? 200 : 500,
      statusText: ok ? 'OK' : 'Internal Server Error',
      json: async () => response?.data,
    } as Response;
  });
  return fn;
}

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'flags-test-'));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

const storageDir = 'node_modules/@vercel/flags-definitions';

async function readOutput(filename: string): Promise<string> {
  return readFile(join(cwd, storageDir, filename), 'utf-8');
}

async function outputExists(filename: string): Promise<boolean> {
  try {
    await readFile(join(cwd, storageDir, filename));
    return true;
  } catch {
    return false;
  }
}

describe('prepareFlagsDefinitions', () => {
  it('should not write files when no SDK keys are present', async () => {
    const fetch = mockFetch([]);

    await prepareFlagsDefinitions({
      cwd,
      env: { SOME_VAR: 'hello' },
      fetch,
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(await outputExists('index.js')).toBe(false);
  });

  it('should fetch definitions for a direct vf_server_ key and write files', async () => {
    const sdkKey = 'vf_server_test_abc123def456';
    const definitions = { flag1: { variants: ['on', 'off'] } };

    const fetch = mockFetch([{ data: definitions }]);

    await prepareFlagsDefinitions({
      cwd,
      env: { FLAGS_SECRET: sdkKey },
      fetch,
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

    // index.js should exist and use hashed key
    const indexJs = await readOutput('index.js');
    expect(indexJs).toContain(sha256(sdkKey));
    expect(indexJs).not.toContain(sdkKey);
    expect(indexJs).toContain('export function get(key)');

    // index.d.ts should exist
    const dts = await readOutput('index.d.ts');
    expect(dts).toContain('export function get(key: string)');

    // package.json should exist
    const packageJson = JSON.parse(await readOutput('package.json'));
    expect(packageJson.name).toBe('@vercel/flags-definitions');
  });

  it('should extract SDK key from flags: format', async () => {
    const sdkKey = 'vf_server_flags_format_key';
    const definitions = { flag1: {} };

    const fetch = mockFetch([{ data: definitions }]);

    await prepareFlagsDefinitions({
      cwd,
      env: { MY_FLAG_VAR: `flags:sdkKey=${sdkKey}&other=value` },
      fetch,
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
    const sdkKey = 'vf_server_duplicate_key';
    const definitions = { flag1: {} };

    const fetch = mockFetch([{ data: definitions }]);

    await prepareFlagsDefinitions({
      cwd,
      env: {
        VAR1: sdkKey,
        VAR2: sdkKey,
        VAR3: `flags:sdkKey=${sdkKey}`,
      },
      fetch,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple distinct SDK keys', async () => {
    const key1 = 'vf_server_key_one_abcdef';
    const key2 = 'vf_server_key_two_ghijkl';
    const defs1 = { flagA: { enabled: true } };
    const defs2 = { flagB: { enabled: false } };

    const fetch = mockFetch([{ data: defs1 }, { data: defs2 }]);

    await prepareFlagsDefinitions({
      cwd,
      env: { VAR1: key1, VAR2: key2 },
      fetch,
    });

    expect(fetch).toHaveBeenCalledTimes(2);

    const indexJs = await readOutput('index.js');

    // Both hashed keys should be present, raw keys should not
    expect(indexJs).toContain(sha256(key1));
    expect(indexJs).toContain(sha256(key2));
    expect(indexJs).not.toContain(key1);
    expect(indexJs).not.toContain(key2);
  });

  it('should deduplicate identical definitions across keys', async () => {
    const key1 = 'vf_server_key_one_abcdef';
    const key2 = 'vf_server_key_two_ghijkl';
    const sameDefs = { flagA: { enabled: true } };

    const fetch = mockFetch([{ data: sameDefs }, { data: sameDefs }]);

    await prepareFlagsDefinitions({
      cwd,
      env: { VAR1: key1, VAR2: key2 },
      fetch,
    });

    const indexJs = await readOutput('index.js');

    // Only one _d0 constant should exist (deduplicated)
    expect(indexJs).toContain('const _d0');
    expect(indexJs).not.toContain('const _d1');

    // Both hashed keys map to _d0
    expect(indexJs).toContain(`${JSON.stringify(sha256(key1))}: _d0`);
    expect(indexJs).toContain(`${JSON.stringify(sha256(key2))}: _d0`);
  });

  it('should produce a valid module structure', async () => {
    const sdkKey = 'vf_server_structure_test_key_123';
    const definitions = { myFlag: { variants: ['a', 'b'] } };

    const fetch = mockFetch([{ data: definitions }]);

    await prepareFlagsDefinitions({
      cwd,
      env: { SDK_KEY: sdkKey },
      fetch,
    });

    const indexJs = await readOutput('index.js');
    const hashedKey = sha256(sdkKey);

    // Map entry uses hashed key pointing to _d0
    expect(indexJs).toContain(`"${hashedKey}": _d0`);

    // _d0 contains the JSON-serialized definitions
    expect(indexJs).toContain(
      `const _d0 = memo(() => JSON.parse(${JSON.stringify(JSON.stringify(definitions))}));`
    );

    // Lookup function uses the hashed key parameter
    expect(indexJs).toContain(
      'export function get(key) {\n  return map[key]?.() ?? null;\n}'
    );

    // Raw key must not appear
    expect(indexJs).not.toContain(sdkKey);

    // Version is included
    expect(indexJs).toContain('export const version = "1.0.1"');
  });

  it('should include Vercel metadata headers when env vars are set', async () => {
    const sdkKey = 'vf_server_meta_key_test';

    const fetch = mockFetch([{ data: {} }]);

    await prepareFlagsDefinitions({
      cwd,
      env: {
        MY_KEY: sdkKey,
        VERCEL_PROJECT_ID: 'prj_123',
        VERCEL_ENV: 'production',
        VERCEL_DEPLOYMENT_ID: 'dpl_456',
        VERCEL_REGION: 'iad1',
      },
      fetch,
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

  it('should throw when fetch fails', async () => {
    const sdkKey = 'vf_server_fail_key_abcdef123';

    const fetch = mockFetch([{ data: null, ok: false }]);

    await expect(
      prepareFlagsDefinitions({
        cwd,
        env: { KEY: sdkKey },
        fetch,
      })
    ).rejects.toThrow('Failed to fetch flag definitions');
  });

  it('should ignore env vars that do not contain SDK keys', async () => {
    const fetch = mockFetch([]);

    await prepareFlagsDefinitions({
      cwd,
      env: {
        HOME: '/home/user',
        PATH: '/usr/bin',
        NODE_ENV: 'production',
        FLAGS_VAR: 'flags:other=value',
        PARTIAL: 'flags:sdkKey=no_vf_server_prefix',
      },
      fetch,
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it('should write version field in the generated module', async () => {
    const fetch = mockFetch([{ data: {} }]);

    await prepareFlagsDefinitions({
      cwd,
      env: { KEY: 'vf_server_version_test' },
      fetch,
    });

    const indexJs = await readOutput('index.js');
    expect(indexJs).toContain('export const version = "1.0.1"');
  });
});
