/**
 * Manual end-to-end check of the low-level TS wrapper against the REAL native
 * helper binary (including a live Touch ID prompt at signing time). This is the
 * layer the CLI will ship — TS → spawn → Secure Enclave — exercised for real,
 * unlike the mocked unit tests.
 *
 * Build the helper first:  pnpm build-biometric-helper
 * Then run:                npx tsx scripts/test-biometric-wrapper.ts
 *
 * Uses a throwaway temp key file so it won't touch your real step-up key.
 */
import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type BiometricHelperOptions,
  deleteBiometricKey,
  getBiometricCapabilities,
  registerBiometricKey,
  signBiometricChallenge,
} from '../src/util/biometric/helper';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options: BiometricHelperOptions = {
  helperPath: join(packageRoot, 'dist-native', 'biometric-helper'),
  keyFile: join(tmpdir(), `vc-biometric-wrapper-${Date.now()}.blob`),
};

console.log('helper:', options.helperPath);
console.log('keyFile:', options.keyFile, '\n');

try {
  console.log('capabilities:', await getBiometricCapabilities(options), '\n');

  console.log('register:', await registerBiometricKey(options), '\n');

  const challenge = randomBytes(32).toString('base64url');
  console.log('signing (a Touch ID prompt should appear)...');
  console.log('sign:', await signBiometricChallenge(options, challenge), '\n');

  console.log('delete:', await deleteBiometricKey(options));
} finally {
  rmSync(options.keyFile, { force: true });
}
