import { createVerify, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const helper = join(packageRoot, 'dist-native', 'biometric-helper');

const challenge = randomBytes(32);

const capabilities = await run('capabilities');
console.log('capabilities:', capabilities);

const registration = await run('register-key');
console.log('registration:', {
  keyId: registration.keyId,
  algorithm: registration.algorithm,
  storage: registration.storage,
});

const signature = await run('sign-challenge', base64urlEncode(challenge));
console.log('signature:', {
  keyId: signature.keyId,
  algorithm: signature.algorithm,
  storage: signature.storage,
});

const verified = createVerify('sha256')
  .update(challenge)
  .verify(
    {
      key: Buffer.concat([
        Buffer.from(
          '3059301306072a8648ce3d020106082a8648ce3d030107034200',
          'hex'
        ),
        base64urlDecode(registration.publicKey),
      ]),
      format: 'der',
      type: 'spki',
    },
    base64urlDecode(signature.signature)
  );

if (!verified) {
  throw new Error('Signature verification failed.');
}

console.log('verified: true');

async function run(...args) {
  const { stdout } = await execFileAsync(helper, args, {
    maxBuffer: 1024 * 1024,
  });
  return JSON.parse(stdout);
}

function base64urlEncode(data) {
  return data
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function base64urlDecode(value) {
  let base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padding = (4 - (base64.length % 4)) % 4;
  if (padding > 0) {
    base64 += '='.repeat(padding);
  }
  return Buffer.from(base64, 'base64');
}
