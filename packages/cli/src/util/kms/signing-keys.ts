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
