import { VercelRequest, VercelResponse } from '@vercel/node';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { errorHandler } from './_lib/util/error-handler';

/**
 * Exchanges a GitHub Actions OIDC token for a short-lived, pathname-scoped
 * Vercel Blob client token so that PR workflows in the `vercel/vercel-internal`
 * repository can upload CLI binaries to the public Blob store without the
 * read-write token ever leaving this deployment's environment.
 *
 * POST /api/pr-binaries-token
 *   Authorization: Bearer <GitHub Actions OIDC JWT>
 *   { "pathname": "pr-binaries/<pr-number>/<asset-name>" }
 *
 * Returns: { "token": "<blob client token>" }
 */

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const EXPECTED_AUDIENCE = 'vercel-cli-pr-binaries';
const ALLOWED_REPOSITORIES = ['vercel/vercel-internal', 'vercel/vercel'];
const PATHNAME_PATTERN = /^pr-binaries\/\d+\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes
// Compiled CLI binaries are ~100 MB; this is a guardrail on the token
// grant, not an expected size.
const MAX_UPLOAD_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB

const jwks = createRemoteJWKSet(
  new URL(`${GITHUB_OIDC_ISSUER}/.well-known/jwks`)
);

function sendError(
  res: VercelResponse,
  status: number,
  code: string,
  message: string
) {
  return res.status(status).json({ error: { code, message } });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendError(
      res,
      405,
      'method_not_allowed',
      'Only POST requests are supported for this endpoint.'
    );
  }

  // Not a typo: the Blob store is connected to this project with the custom
  // env prefix `CLI_BLOB_READ_WRITE_TOKEN`, and Vercel appends
  // `_READ_WRITE_TOKEN` to the prefix when injecting the variable.
  const readWriteToken = process.env.CLI_BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN;
  if (!readWriteToken) {
    return sendError(
      res,
      503,
      'not_configured',
      'The Blob store for PR binaries is not configured on this deployment yet.'
    );
  }

  const authorization = req.headers.authorization || '';
  const oidcToken = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null;
  if (!oidcToken) {
    return sendError(
      res,
      401,
      'missing_token',
      'Expected a GitHub Actions OIDC token in the Authorization header.'
    );
  }

  const pathname =
    typeof req.body === 'object' && req.body !== null
      ? req.body.pathname
      : undefined;
  if (typeof pathname !== 'string' || !PATHNAME_PATTERN.test(pathname)) {
    return sendError(
      res,
      400,
      'invalid_pathname',
      'Expected `pathname` matching pr-binaries/<pr-number>/<asset-name>.'
    );
  }

  let claims;
  try {
    const { payload } = await jwtVerify(oidcToken, jwks, {
      issuer: GITHUB_OIDC_ISSUER,
      audience: EXPECTED_AUDIENCE,
    });
    claims = payload;
  } catch {
    return sendError(
      res,
      401,
      'invalid_token',
      'The provided OIDC token could not be verified.'
    );
  }

  const repository = claims.repository;
  if (
    typeof repository !== 'string' ||
    !ALLOWED_REPOSITORIES.includes(repository)
  ) {
    return sendError(
      res,
      403,
      'forbidden_repository',
      'This OIDC token was not issued to an allowed repository.'
    );
  }

  try {
    const token = await generateClientTokenFromReadWriteToken({
      token: readWriteToken,
      pathname,
      validUntil: Date.now() + TOKEN_TTL_MS,
      allowOverwrite: true,
      addRandomSuffix: false,
      maximumSizeInBytes: MAX_UPLOAD_SIZE_BYTES,
    });
    return res.status(200).json({ token });
  } catch (error) {
    errorHandler(error as Error, { url: req.url, pathname, repository });
    return sendError(
      res,
      500,
      'token_generation_failed',
      'Failed to generate a Blob client token.'
    );
  }
}
