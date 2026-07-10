import { createVerify, randomBytes } from 'node:crypto';
import type Client from '../client';
import getUser from '../get-user';
import output from '../../output-manager';
import {
  type BiometricHelperOptions,
  biometricKeyFilePath,
  deleteBiometricKey,
  getBiometricCapabilities,
  readBiometricBinding,
  registerBiometricKey,
  resolveBiometricHelper,
  signBiometricChallenge,
  writeBiometricBinding,
} from './helper';

/**
 * SubjectPublicKeyInfo DER prefix for an uncompressed (x9.63) P-256 public key.
 * Prepended to the helper's `publicKey` so Node's verifier can load it as SPKI.
 */
const SPKI_P256_PREFIX = Buffer.from(
  '3059301306072a8648ce3d020106082a8648ce3d030107034200',
  'hex'
);

export type StepUpResult =
  | { ok: true; keyId: string; userId: string }
  | {
      ok: false;
      reason: 'unsupported' | 'canceled' | 'error';
      message: string;
    };

/**
 * Locally verify an ES256 signature over `challenge` against the registered
 * public key.
 *
 * DEMO ONLY: in the real flow the challenge is minted by the API and the
 * signature is verified server-side (which then rotates the token pair). Here
 * we mint and verify locally just to exercise the Touch ID UX before the API
 * endpoints exist. A locally-verified signature proves nothing to a server, so
 * this must never be the shipped step-up path.
 */
function verifySignatureLocally(
  publicKeyBase64url: string,
  challenge: Buffer,
  signatureBase64url: string
): boolean {
  try {
    const spki = Buffer.concat([
      SPKI_P256_PREFIX,
      Buffer.from(publicKeyBase64url, 'base64url'),
    ] as unknown as readonly Uint8Array[]);
    return createVerify('sha256')
      .update(challenge as unknown as NodeJS.ArrayBufferView)
      .verify(
        { key: spki, format: 'der', type: 'spki' },
        Buffer.from(
          signatureBase64url,
          'base64url'
        ) as unknown as NodeJS.ArrayBufferView
      );
  } catch {
    return false;
  }
}

/**
 * Drive a biometric step-up bound to the logged-in Vercel user: ensure a
 * Secure Enclave key exists for that user, then prompt Touch ID to sign a
 * challenge.
 *
 * "Bound to the user" means: the key blob lives in a per-user directory, and a
 * binding manifest records which user the key was created for; a key whose
 * binding names a different user is refused. macOS itself can only answer
 * "did an enrolled finger match" — it has no notion of Vercel identity — so
 * this binding is the client-side half, and the server-side key registration
 * (Phase 3) makes it unforgeable.
 *
 * This is structured like the eventual production flow (resolve → capabilities
 * → register → challenge → sign → verify), but the challenge is generated
 * locally and {@link verifySignatureLocally} stands in for the API verify step.
 * When the API endpoints land, the register/challenge/verify steps become HTTP
 * calls and this returns the rotated tokens instead of just a key id.
 */
export async function stepUpWithBiometrics(
  client: Client
): Promise<StepUpResult> {
  const resolved = resolveBiometricHelper(client);
  if (!resolved.ok) {
    return { ok: false, reason: resolved.reason, message: resolved.message };
  }

  let userId: string;
  try {
    userId = (await getUser(client)).id;
  } catch {
    return {
      ok: false,
      reason: 'error',
      message:
        'Could not determine the logged-in user for biometric step-up. Run `vercel whoami` to check your login.',
    };
  }
  if (!/^[\w.-]+$/.test(userId)) {
    return {
      ok: false,
      reason: 'error',
      message: 'The logged-in user id cannot be used for biometric step-up.',
    };
  }

  const options: BiometricHelperOptions = {
    helperPath: resolved.helperPath,
    keyFile: biometricKeyFilePath(client.getGlobalPathConfig(), userId),
  };

  const caps = await getBiometricCapabilities(options);
  if (!caps.ok) {
    return { ok: false, reason: caps.reason, message: caps.message };
  }
  if (!caps.capabilities.supported) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'Biometric authentication is not available on this device.',
    };
  }

  const registration = await registerBiometricKey(options);
  if (!registration.ok) {
    return {
      ok: false,
      reason: registration.reason,
      message: registration.message,
    };
  }

  // Enforce the user binding. The key file path is already per-user, so a
  // mismatching manifest means the blob was copied or edited — refuse rather
  // than repair. A missing/stale manifest for a matching layout is repaired
  // (first registration, or the SE key was recreated out of band).
  const binding = await readBiometricBinding(options.keyFile);
  if (binding && binding.userId !== userId) {
    return {
      ok: false,
      reason: 'error',
      message:
        'The biometric key on this machine belongs to a different Vercel user. Log in as that user, or delete the key directory under `~/.vercel/biometric` to start over.',
    };
  }
  let publicKey = registration.registration.publicKey;
  if (!binding || binding.keyId !== registration.registration.keyId) {
    await writeBiometricBinding(options.keyFile, {
      version: 1,
      keyId: registration.registration.keyId,
      userId,
      createdAt: Date.now(),
      policy: 'biometryCurrentSet',
    });
  }

  const challenge = randomBytes(32);
  output.log('Authorize this action with Touch ID…');
  let signature = await signBiometricChallenge(
    options,
    challenge.toString('base64url')
  );

  // .biometryCurrentSet invalidates the key whenever the Mac's fingerprint
  // enrollment changes. In this client-only phase we recover by re-registering
  // in place (trust-on-registration). Once the server verifies keys, recovery
  // MUST instead require a full re-login — a silently re-registered key would
  // defeat the binding.
  if (!signature.ok && signature.code === 'key_invalidated') {
    output.log(
      'Your Mac’s fingerprint enrollment changed, which invalidated the Vercel Touch ID key. Re-registering…'
    );
    await deleteBiometricKey(options);
    const rereg = await registerBiometricKey(options);
    if (!rereg.ok) {
      return { ok: false, reason: rereg.reason, message: rereg.message };
    }
    publicKey = rereg.registration.publicKey;
    await writeBiometricBinding(options.keyFile, {
      version: 1,
      keyId: rereg.registration.keyId,
      userId,
      createdAt: Date.now(),
      policy: 'biometryCurrentSet',
    });
    output.log('Authorize this action with Touch ID…');
    signature = await signBiometricChallenge(
      options,
      challenge.toString('base64url')
    );
  }

  if (!signature.ok) {
    return {
      ok: false,
      reason: signature.reason,
      message: signature.message,
    };
  }

  const verified = verifySignatureLocally(
    publicKey,
    challenge,
    signature.signature.signature
  );
  if (!verified) {
    return {
      ok: false,
      reason: 'error',
      message: 'Biometric signature verification failed.',
    };
  }

  return { ok: true, keyId: signature.signature.keyId, userId };
}
