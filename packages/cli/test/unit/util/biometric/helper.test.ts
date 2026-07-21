import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Control CI detection deterministically regardless of where the suite runs.
vi.mock('ci-info', () => ({ default: { isCI: false } }));

import type Client from '../../../../src/util/client';
import {
  type BiometricBinding,
  type BiometricHelperOptions,
  biometricBindingFilePath,
  biometricKeyFilePath,
  deleteBiometricKey,
  getBiometricCapabilities,
  readBiometricBinding,
  registerBiometricKey,
  resolveBiometricHelper,
  signBiometricChallenge,
  writeBiometricBinding,
} from '../../../../src/util/biometric/helper';

let tmp: string;

/**
 * Minimal `Client` stand-in for `resolveBiometricHelper`, which only reads
 * `stdin.isTTY`. Avoids importing the full mock client (and its heavy
 * workspace dependency graph) into this leaf unit test.
 */
function makeClient(opts?: { isTTY?: boolean }): Client {
  return {
    stdin: { isTTY: opts?.isTTY ?? true },
  } as unknown as Client;
}

/**
 * Write an executable stub that stands in for the native helper. The body is a
 * Node script that receives the same argv the real binary would and prints JSON
 * to stdout (optionally exiting non-zero, like the real helper does on error).
 */
function writeMockHelper(body: string): string {
  const path = join(
    tmp,
    `mock-helper-${Math.random().toString(36).slice(2)}.mjs`
  );
  writeFileSync(path, `#!/usr/bin/env node\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

function optionsFor(helperPath: string): BiometricHelperOptions {
  return { helperPath, keyFile: join(tmp, 'key.blob') };
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'vc-biometric-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  delete process.env.VERCEL_BIOMETRIC_HELPER_PATH;
});

describe('biometricKeyFilePath', () => {
  it('scopes the blob to the user under the global config directory', () => {
    expect(biometricKeyFilePath('/home/me/.vercel', 'user_123')).toBe(
      '/home/me/.vercel/biometric/user_123/step-up-key.blob'
    );
  });
});

describe('binding manifest', () => {
  function makeBinding(
    overrides?: Partial<BiometricBinding>
  ): BiometricBinding {
    return {
      version: 1,
      keyId: 'key-abc',
      userId: 'user_123',
      createdAt: 1700000000000,
      policy: 'biometryCurrentSet',
      ...overrides,
    };
  }

  it('lives next to the key blob', () => {
    expect(biometricBindingFilePath('/x/biometric/user_123/key.blob')).toBe(
      '/x/biometric/user_123/binding.json'
    );
  });

  it('round-trips a binding', async () => {
    const keyFile = join(tmp, 'user_123', 'step-up-key.blob');
    const binding = makeBinding();
    await writeBiometricBinding(keyFile, binding);
    expect(await readBiometricBinding(keyFile)).toEqual(binding);
  });

  it('returns null when no manifest exists', async () => {
    expect(
      await readBiometricBinding(join(tmp, 'nope', 'key.blob'))
    ).toBeNull();
  });

  it('returns null for malformed JSON', async () => {
    const keyFile = join(tmp, 'key.blob');
    writeFileSync(biometricBindingFilePath(keyFile), 'not json');
    expect(await readBiometricBinding(keyFile)).toBeNull();
  });

  it('returns null for a manifest missing required fields', async () => {
    const keyFile = join(tmp, 'key.blob');
    writeFileSync(
      biometricBindingFilePath(keyFile),
      JSON.stringify({ version: 1, keyId: 'k' })
    );
    expect(await readBiometricBinding(keyFile)).toBeNull();
  });
});

describe('runtime command parsing', () => {
  it('parses capabilities output', async () => {
    const helper = writeMockHelper(
      `process.stdout.write(JSON.stringify({ ok: true, platform: 'darwin', supported: true, hasKey: false, biometryAvailable: true, userPresenceAvailable: true, biometryType: 'touchID', secureEnclaveAvailable: true }))`
    );
    const result = await getBiometricCapabilities(optionsFor(helper));
    expect(result).toMatchObject({
      ok: true,
      capabilities: { supported: true, biometryType: 'touchID' },
    });
  });

  it('parses register-key output', async () => {
    const helper = writeMockHelper(
      `process.stdout.write(JSON.stringify({ ok: true, keyId: 'abc', algorithm: 'ES256', storage: 'secure-enclave', publicKey: 'BASE64URL' }))`
    );
    const result = await registerBiometricKey(optionsFor(helper));
    expect(result).toMatchObject({
      ok: true,
      registration: {
        keyId: 'abc',
        algorithm: 'ES256',
        publicKey: 'BASE64URL',
      },
    });
  });

  it('forwards the challenge argument and key-file env to the helper', async () => {
    // Echo back the received argv[2] and the key-file env var so we can assert
    // the wrapper passed them through correctly.
    // argv[2] is the subcommand ('sign-challenge'); argv[3] is the challenge.
    const helper = writeMockHelper(
      `process.stdout.write(JSON.stringify({ ok: true, keyId: 'k', algorithm: 'ES256', storage: 'secure-enclave', signature: process.argv[3] + '|' + process.env.VERCEL_BIOMETRIC_KEY_FILE }))`
    );
    const options = optionsFor(helper);
    const result = await signBiometricChallenge(options, 'CHALLENGE123');
    expect(result).toMatchObject({
      ok: true,
      signature: { signature: `CHALLENGE123|${options.keyFile}` },
    });
  });

  it('parses delete-key output', async () => {
    const helper = writeMockHelper(
      `process.stdout.write(JSON.stringify({ ok: true, deleted: true }))`
    );
    const result = await deleteBiometricKey(optionsFor(helper));
    expect(result).toMatchObject({ ok: true, deletion: { deleted: true } });
  });
});

describe('error normalization', () => {
  it('maps a canceled Touch ID prompt to reason "canceled"', async () => {
    const helper = writeMockHelper(
      `process.stdout.write(JSON.stringify({ ok: false, error: 'Authentication canceled.', code: 'canceled' })); process.exit(1)`
    );
    const result = await signBiometricChallenge(optionsFor(helper), 'x');
    expect(result).toEqual({
      ok: false,
      reason: 'canceled',
      code: 'canceled',
      message: 'Authentication canceled.',
    });
  });

  it('maps helper "unsupported" to reason "unsupported"', async () => {
    const helper = writeMockHelper(
      `process.stdout.write(JSON.stringify({ ok: false, error: 'No Secure Enclave.', code: 'unsupported' })); process.exit(1)`
    );
    const result = await registerBiometricKey(optionsFor(helper));
    expect(result).toMatchObject({ ok: false, reason: 'unsupported' });
  });

  it('preserves the key_invalidated code for enrollment-change recovery', async () => {
    const helper = writeMockHelper(
      `process.stdout.write(JSON.stringify({ ok: false, error: 'Key access control can no longer be satisfied.', code: 'key_invalidated' })); process.exit(1)`
    );
    const result = await signBiometricChallenge(optionsFor(helper), 'x');
    expect(result).toEqual({
      ok: false,
      reason: 'error',
      code: 'key_invalidated',
      message: 'Key access control can no longer be satisfied.',
    });
  });

  it('maps any other helper code to reason "error" while preserving the raw code', async () => {
    const helper = writeMockHelper(
      `process.stdout.write(JSON.stringify({ ok: false, error: 'boom', code: 'NSOSStatusErrorDomain' })); process.exit(1)`
    );
    const result = await signBiometricChallenge(optionsFor(helper), 'x');
    expect(result).toEqual({
      ok: false,
      reason: 'error',
      code: 'NSOSStatusErrorDomain',
      message: 'boom',
    });
  });

  it('reads the JSON error even when the helper exits non-zero', async () => {
    const helper = writeMockHelper(
      `process.stdout.write(JSON.stringify({ ok: false, error: 'no key', code: 'error' })); process.exit(1)`
    );
    const result = await signBiometricChallenge(optionsFor(helper), 'x');
    expect(result).toMatchObject({
      ok: false,
      reason: 'error',
      message: 'no key',
    });
  });

  it('returns an error result for malformed helper output', async () => {
    const helper = writeMockHelper(`process.stdout.write('not json at all')`);
    const result = await getBiometricCapabilities(optionsFor(helper));
    expect(result).toMatchObject({
      ok: false,
      reason: 'error',
      code: 'helper_invalid_output',
    });
  });

  it('returns an error result when the helper cannot be spawned', async () => {
    const result = await getBiometricCapabilities(
      optionsFor(join(tmp, 'does-not-exist'))
    );
    expect(result).toMatchObject({
      ok: false,
      reason: 'error',
      code: 'helper_spawn_failed',
    });
  });
});

describe('resolveBiometricHelper', () => {
  const originalPlatform = process.platform;

  function setPlatform(value: NodeJS.Platform) {
    Object.defineProperty(process, 'platform', { value, configurable: true });
  }

  afterEach(() => {
    setPlatform(originalPlatform);
    delete process.env.CI;
  });

  afterAll(() => {
    setPlatform(originalPlatform);
  });

  it('is unsupported off macOS', () => {
    setPlatform('linux');
    const result = resolveBiometricHelper(makeClient());
    expect(result).toMatchObject({ ok: false, reason: 'unsupported' });
  });

  it('is unsupported in CI', () => {
    setPlatform('darwin');
    process.env.CI = '1';
    const result = resolveBiometricHelper(makeClient());
    expect(result).toMatchObject({ ok: false, reason: 'unsupported' });
  });

  it('is unsupported without a TTY', () => {
    setPlatform('darwin');
    const result = resolveBiometricHelper(makeClient({ isTTY: false }));
    expect(result).toMatchObject({ ok: false, reason: 'unsupported' });
  });

  it('is unsupported when the helper binary is missing', () => {
    setPlatform('darwin');
    process.env.VERCEL_BIOMETRIC_HELPER_PATH = join(tmp, 'missing');
    const result = resolveBiometricHelper(makeClient());
    expect(result).toMatchObject({ ok: false, reason: 'unsupported' });
  });

  it('resolves the helper path when all preconditions are met', () => {
    setPlatform('darwin');
    const helper = writeMockHelper(`process.stdout.write('{}')`);
    process.env.VERCEL_BIOMETRIC_HELPER_PATH = helper;
    const result = resolveBiometricHelper(makeClient());
    expect(result).toEqual({ ok: true, helperPath: helper });
  });
});
