import { createVerify, randomBytes } from 'node:crypto';
import type Client from '../client';
import output from '../../output-manager';
import {
  getBiometricCapabilities,
  registerBiometricKey,
  resolveBiometricHelper,
  signBiometricChallenge,
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
  | { ok: true; keyId: string }
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
    ]);
    return createVerify('sha256')
      .update(challenge)
      .verify(
        { key: spki, format: 'der', type: 'spki' },
        Buffer.from(signatureBase64url, 'base64url')
      );
  } catch {
    return false;
  }
}

/**
 * Drive a biometric step-up: ensure a Secure Enclave key exists, then prompt
 * Touch ID to sign a challenge.
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

  const caps = await getBiometricCapabilities(resolved);
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

  const registration = await registerBiometricKey(resolved);
  if (!registration.ok) {
    return {
      ok: false,
      reason: registration.reason,
      message: registration.message,
    };
  }

  const challenge = randomBytes(32);
  output.log('Authorize this action with Touch ID…');
  const signature = await signBiometricChallenge(
    resolved,
    challenge.toString('base64url')
  );
  if (!signature.ok) {
    return {
      ok: false,
      reason: signature.reason,
      message: signature.message,
    };
  }

  const verified = verifySignatureLocally(
    registration.registration.publicKey,
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

  return { ok: true, keyId: signature.signature.keyId };
}
