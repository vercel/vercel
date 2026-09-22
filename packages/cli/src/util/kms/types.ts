import type { JSONObject } from '@vercel-internals/types';

export const KMS_ALGORITHMS = [
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
  'EdDSA',
] as const;

export type KmsAlgorithm = (typeof KMS_ALGORITHMS)[number];

export type IssuerOrigin = 'vercel' | 'external';

export type SigningKeyStatus = 'pending' | 'active' | 'revoking';

export const PROJECT_GRANT_POLICY_KIND = 'project-grant';
export const CONNEX_GRANT_POLICY_KIND = 'connex-grant';

export interface SigningKey {
  keyId: string;
  /** JWT/JWKS `kid` for an imported key; may differ from `keyId`. */
  importKeyId?: string;
  issuerId: string;
  algorithm: string;
  status: SigningKeyStatus;
  publicKey?: JSONObject;
  publicKeyFingerprint?: string;
  publicKeyPem?: string;
  certificatePem?: string;
  createdAt: string;
  updatedAt: string;
  revokeAt?: string;
  activateAt?: string;
  activatedAt?: string;
}

export interface ProjectGrantPolicy {
  kind: typeof PROJECT_GRANT_POLICY_KIND;
  teamId: string;
  projectId: string;
  environments: string[];
  tokenClaims?: JSONObject;
  createdAt: string;
  updatedAt: string;
}

export interface ConnexGrantPolicy {
  kind: typeof CONNEX_GRANT_POLICY_KIND;
  clientId: string;
  tokenClaims?: JSONObject;
  createdAt: string;
  updatedAt: string;
}

export type IssuerPolicy = ProjectGrantPolicy | ConnexGrantPolicy;

export interface Issuer {
  id: string;
  ownerId: string;
  name: string;
  algorithm: KmsAlgorithm;
  origin: IssuerOrigin;
  /** Set when another service (e.g. Vercel Connect) owns this issuer. */
  managedBy?: string;
  claimsSchema?: JSONObject;
  createdAt: string;
  updatedAt: string;
  signingKeys: SigningKey[];
  /**
   * Empty unless the caller can manage grants, which the API does not
   * distinguish from an issuer that genuinely has none.
   */
  policies: IssuerPolicy[];
}

export interface IssuerListResponse {
  issuers: Issuer[];
  pagination: {
    count: number;
    /** Opaque base64url cursor, or null on the last page. */
    next: string | null;
  };
}

export function isProjectGrant(
  policy: IssuerPolicy
): policy is ProjectGrantPolicy {
  return policy.kind === PROJECT_GRANT_POLICY_KIND;
}

/** The issuer URL KMS publishes keys under, and the `iss` claim it signs. */
export function issuerUrl(issuerId: string): string {
  return `https://kms.vercel.com/${issuerId}`;
}

/** Where the issuer's public keys are published. */
export function issuerJwksUrl(issuerId: string): string {
  return `${issuerUrl(issuerId)}/jwks.json`;
}
