import type { Span } from '@vercel/build-utils';
import type { OidcClaims } from './util';
import { debug, done, readString, step, tokenFingerprint } from './util';

export interface OidcTokenPayload extends OidcClaims {
  exp?: number;
  iss?: string;
  project_id?: string;
}

export function parseOidcToken(token: string): OidcTokenPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error(
      'VERCEL_OIDC_TOKEN is not a valid JWT (expected 3 dot-separated segments).'
    );
  }

  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(json) as OidcTokenPayload;
  } catch {
    throw new Error('VERCEL_OIDC_TOKEN has an unreadable JWT payload.');
  }
}

function resolveProjectContext(token: string): {
  projectId?: string;
  teamId?: string;
} {
  const claims = parseOidcToken(token);

  return {
    projectId: readString(process.env.VERCEL_PROJECT_ID) ?? claims.project_id,
    teamId:
      readString(process.env.VERCEL_TEAM_ID) ??
      readString(process.env.VERCEL_ORG_ID) ??
      claims.owner_id,
  };
}

async function mintProjectOidcToken(params: {
  projectId: string;
  teamId?: string;
  authToken: string;
}): Promise<string> {
  const apiUrl = (
    readString(process.env.VERCEL_API_URL) ?? 'https://api.vercel.com'
  ).replace(/\/+$/, '');
  const query = new URLSearchParams({ source: 'vercel-container-build' });
  if (params.teamId) {
    query.set('teamId', params.teamId);
  }
  const url = `${apiUrl}/v1/projects/${encodeURIComponent(params.projectId)}/token?${query}`;

  debug(`OIDC mint: POST ${url}`);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${params.authToken}`,
      'content-type': 'application/json',
    },
  });

  if (!res.ok) {
    const body = (await res.text()).trim();
    throw new Error(
      `Failed to mint OIDC token: HTTP ${res.status}` +
        (body ? ` — ${body.split('\n').slice(-3).join('\n')}` : '')
    );
  }

  const payload = (await res.json()) as { token?: string };
  if (!payload.token) {
    throw new Error('Failed to mint OIDC token: response missing `token`.');
  }

  return payload.token;
}

/**
 * Resolve the project OIDC token used to authenticate to the container
 * registry.
 *
 * The token produced by `vercel pull` (or provided by the platform) in
 * `VERCEL_OIDC_TOKEN` is already a valid project OIDC token, so we use it
 * directly. Minting a *fresh* token requires a credential that can authorize
 * `POST /v1/projects/{id}/token` — an OIDC token cannot mint another OIDC
 * token, so that call only works when a user/CLI auth token is available
 * (`VERCEL_TOKEN`). Minting is therefore best-effort: if it is not possible or
 * fails, we fall back to the existing token rather than failing the build.
 */
export async function resolveOidcTokenForBuild(span?: Span): Promise<string> {
  const existing = readString(process.env.VERCEL_OIDC_TOKEN);
  if (!existing) {
    throw new Error(
      'Missing VERCEL_OIDC_TOKEN for the container registry ' +
        '(set by the platform or `vercel pull`).'
    );
  }

  // A user/CLI auth token is the only credential that can mint a fresh project
  // OIDC token. Without it, the existing token is the best we have.
  const authToken = readString(process.env.VERCEL_TOKEN);
  if (!authToken) {
    debug(
      'No VERCEL_TOKEN available to mint; using existing VERCEL_OIDC_TOKEN'
    );
    span?.setAttributes({ 'oidc.mint_result': 'reused_existing' });
    debug(`registry token: ${tokenFingerprint(existing)}`);
    return existing;
  }

  const { projectId, teamId } = resolveProjectContext(existing);
  if (!projectId) {
    debug('No project id available to mint; using existing VERCEL_OIDC_TOKEN');
    span?.setAttributes({ 'oidc.mint_result': 'reused_existing' });
    return existing;
  }

  step('Minting fresh OIDC token for container registry');
  let token: string;
  try {
    token = await mintProjectOidcToken({
      projectId,
      teamId,
      authToken,
    });
  } catch (err) {
    // Minting is an optimization; fall back to the existing token.
    debug(`OIDC mint failed, using existing token: ${(err as Error).message}`);
    span?.setAttributes({ 'oidc.mint_result': 'failed_reused_existing' });
    return existing;
  }

  process.env.VERCEL_OIDC_TOKEN = token;
  span?.setAttributes({
    'oidc.mint_result': 'minted',
    'project.id': projectId,
    ...(teamId ? { 'team.id': teamId } : {}),
  });
  done('OIDC token minted');
  debug(`registry token: ${tokenFingerprint(token)}`);
  return token;
}

export function formatVcrAuthError(
  registry: string,
  username: string,
  detail?: string
): string {
  return [
    `Authentication to ${registry} as "${username}" was rejected.`,
    '',
    `Make sure your team ("${username}") is enrolled in the`,
    '`vercel-enable-vcr` flag and that the OIDC token is valid for it.',
    ...(detail ? ['', detail] : []),
  ].join('\n');
}
