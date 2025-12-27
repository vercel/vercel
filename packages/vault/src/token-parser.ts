import type { OidcTokenClaims } from './types';
import { VaultTokenError } from './errors';

/**
 * Decodes a JWT token and extracts the payload.
 * Based on getTokenPayload from @vercel/oidc/src/token-util.ts
 */
function getTokenPayload(token: string): OidcTokenClaims {
  const tokenParts = token.split('.');
  if (tokenParts.length !== 3) {
    throw new Error('Invalid token format');
  }

  const base64 = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    '='
  );
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

export function parseOidcToken(token: string): OidcTokenClaims {
  try {
    const payload = getTokenPayload(token);
    return payload;
  } catch (error) {
    throw new VaultTokenError('Failed to parse OIDC token', error);
  }
}

export function extractTeamId(token: string): string {
  const claims = parseOidcToken(token);

  if (!claims.owner_id) {
    throw new VaultTokenError(
      'OIDC token does not contain owner_id claim. Ensure OIDC is enabled in your Vercel project settings.'
    );
  }

  return claims.owner_id;
}

export function extractProjectId(token: string): string {
  const claims = parseOidcToken(token);

  if (!claims.project_id) {
    throw new VaultTokenError(
      'OIDC token does not contain project_id claim. Ensure OIDC is enabled in your Vercel project settings.'
    );
  }

  return claims.project_id;
}

export function extractContext(token: string): {
  teamId: string;
  projectId: string;
  environment?: string;
} {
  const claims = parseOidcToken(token);

  if (!claims.owner_id || !claims.project_id) {
    throw new VaultTokenError(
      'OIDC token missing required claims (owner_id, project_id). Ensure OIDC is enabled.'
    );
  }

  return {
    teamId: claims.owner_id,
    projectId: claims.project_id,
    environment: claims.environment,
  };
}
