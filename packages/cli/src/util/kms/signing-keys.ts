import type Client from '../client';
import type { Issuer, SigningKey } from './types';

function keysPath(issuerId: string): string {
  return `/v1/kms/issuers/${encodeURIComponent(issuerId)}/keys`;
}

function keyPath(issuerId: string, keyId: string): string {
  return `${keysPath(issuerId)}/${encodeURIComponent(keyId)}`;
}

export type CreateSigningKeyPayload = {
  activation?: 'automatic' | 'manual';
  /** Hours after activation before the previous key stops signing. */
  revokePreviousAfterHours?: number;
  /** PEM private key. Only accepted for issuers with `origin: 'external'`. */
  importKey?: string;
  importKeyId?: string;
};

/**
 * Validates the `--revoke-previous-after-hours` flag. `arg` coerces a
 * non-numeric value (e.g. `--revoke-previous-after-hours soon`) to `NaN`, which
 * would slip past a `< 0` check and then serialize to `null` in the API
 * payload. Reject non-finite and negative values up front. Returns an error
 * message to surface, or `null` when the value is valid or omitted.
 */
export function validateRevokePreviousAfterHours(
  value: number | undefined
): string | null {
  if (value === undefined) {
    return null;
  }
  if (!Number.isFinite(value)) {
    return '--revoke-previous-after-hours must be a number of hours.';
  }
  if (value < 0) {
    return '--revoke-previous-after-hours must be 0 or more.';
  }
  return null;
}

export async function createSigningKey(
  client: Client,
  issuerId: string,
  payload: CreateSigningKeyPayload
): Promise<SigningKey> {
  return client.fetch<SigningKey>(keysPath(issuerId), {
    method: 'POST',
    body: payload,
  });
}

export type ActivateSigningKeyPayload = {
  revokePreviousAfterHours?: number;
};

export async function activateSigningKey(
  client: Client,
  issuerId: string,
  keyId: string,
  payload: ActivateSigningKeyPayload
): Promise<SigningKey> {
  return client.fetch<SigningKey>(`${keyPath(issuerId, keyId)}/activate`, {
    method: 'POST',
    body: payload,
  });
}

/**
 * Revokes a key that is already scheduled for revocation, ending its grace
 * period immediately. Returns the full issuer rather than the key.
 */
export async function revokeSigningKey(
  client: Client,
  issuerId: string,
  keyId: string
): Promise<Issuer> {
  return client.fetch<Issuer>(`${keyPath(issuerId, keyId)}/revoke`, {
    method: 'POST',
    body: {},
  });
}
