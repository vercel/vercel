import type { JSONObject } from '@vercel-internals/types';
import type Client from '../client';
import type { Issuer, IssuerListResponse, KmsAlgorithm } from './types';

const ISSUERS_PATH = '/v1/kms/issuers';

function issuerPath(issuerId: string): string {
  return `${ISSUERS_PATH}/${encodeURIComponent(issuerId)}`;
}

export type ListIssuersOptions = {
  limit?: number;
  /** Opaque cursor from a previous page's `pagination.next`. */
  next?: string;
};

export async function getIssuers(
  client: Client,
  { limit, next }: ListIssuersOptions = {}
): Promise<IssuerListResponse> {
  const query = new URLSearchParams();
  if (limit !== undefined) {
    query.set('limit', String(limit));
  }
  if (next !== undefined) {
    query.set('next', next);
  }
  const search = query.toString();
  return client.fetch<IssuerListResponse>(
    search ? `${ISSUERS_PATH}?${search}` : ISSUERS_PATH
  );
}

export async function getIssuer(
  client: Client,
  issuerId: string
): Promise<Issuer> {
  return client.fetch<Issuer>(issuerPath(issuerId));
}

export type CreateIssuerPayload = {
  name: string;
  algorithm?: KmsAlgorithm;
  claimsSchema?: JSONObject;
  importKey?: string;
  importKeyId?: string;
};

export async function createIssuer(
  client: Client,
  payload: CreateIssuerPayload
): Promise<Issuer> {
  return client.fetch<Issuer>(ISSUERS_PATH, {
    method: 'POST',
    body: payload,
  });
}

export type UpdateIssuerPayload = {
  name?: string;
  /** `null` clears the schema; an object replaces it. */
  claimsSchema?: JSONObject | null;
};

export async function updateIssuer(
  client: Client,
  issuerId: string,
  payload: UpdateIssuerPayload
): Promise<Issuer> {
  return client.fetch<Issuer>(issuerPath(issuerId), {
    method: 'PATCH',
    body: payload,
  });
}

export async function deleteIssuer(
  client: Client,
  issuerId: string
): Promise<void> {
  await client.fetch(issuerPath(issuerId), { method: 'DELETE' });
}
