import { randomUUID } from 'crypto';
import { describe, beforeEach, afterEach, test, vi, expect } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

vi.mock('./token-io');
vi.mock('./get-context', () => ({
  getContext: () => ({ headers: {} }),
}));

import { findRootDir, getUserDataDir } from './token-io';
import { getVercelOidcToken } from './get-vercel-oidc-token';
import * as tokenUtil from './token-util';

describe('getVercelOidcToken - Error Scenarios', () => {
  let rootDir: string;
  let userDataDir: string;
  let cliDataDir: string;
  let tokenDataDir: string;

  const projectId = 'test-project-id';
  const teamId = 'test-team-id';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();

    process.env.VERCEL_OIDC_TOKEN = undefined;
    const random = `test-${randomUUID()}`;

    rootDir = path.join(os.tmpdir(), random);

    userDataDir = path.join(rootDir, 'data');
    cliDataDir = path.join(userDataDir, 'com.vercel.cli');
    tokenDataDir = path.join(userDataDir, 'com.vercel.token');

    fs.mkdirSync(cliDataDir, { recursive: true });
    fs.mkdirSync(tokenDataDir, { recursive: true });
    fs.mkdirSync(path.join(rootDir, '.vercel'), {
      recursive: true,
    });

    vi.spyOn(process, 'cwd').mockReturnValue(rootDir);
    vi.mocked(findRootDir).mockReturnValue(rootDir);
    vi.mocked(getUserDataDir).mockReturnValue(userDataDir);
  });

  afterEach(() => {
    // Clean up test directories
    if (fs.existsSync(rootDir)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('should throw helpful error when CLI auth file is missing', async () => {
    // Setup: Create project.json but no auth.json
    fs.writeFileSync(
      path.join(rootDir, '.vercel', 'project.json'),
      JSON.stringify({ projectId, orgId: teamId })
    );

    // Don't create auth.json file

    // Create expired token to trigger refresh
    const expiredToken = createExpiredToken();
    process.env.VERCEL_OIDC_TOKEN = expiredToken;

    await expect(getVercelOidcToken()).rejects.toThrow(
      /Failed to refresh OIDC token: Log in to Vercel CLI and link your project with `vc link`/
    );
  });

  test('should throw helpful error when project.json is missing', async () => {
    // Setup: Create auth.json but no project.json
    fs.writeFileSync(
      path.join(cliDataDir, 'auth.json'),
      JSON.stringify({ token: 'test-auth-token' })
    );

    // Don't create project.json

    // Create expired token to trigger refresh
    const expiredToken = createExpiredToken();
    process.env.VERCEL_OIDC_TOKEN = expiredToken;

    await expect(getVercelOidcToken()).rejects.toThrow(
      /project\.json not found, have you linked your project with `vc link\?`/
    );
  });

  test('should throw helpful error when root directory cannot be found', async () => {
    // Setup: Mock findRootDir to return null
    vi.mocked(findRootDir).mockReturnValue(null);

    // Create expired token to trigger refresh
    const expiredToken = createExpiredToken();
    process.env.VERCEL_OIDC_TOKEN = expiredToken;

    await expect(getVercelOidcToken()).rejects.toThrow(
      /Unable to find project root directory\. Have you linked your project with `vc link\?`/
    );
  });

  test('should throw helpful error when user data directory cannot be found', async () => {
    // Setup: Create project.json
    fs.writeFileSync(
      path.join(rootDir, '.vercel', 'project.json'),
      JSON.stringify({ projectId, orgId: teamId })
    );

    // Mock getUserDataDir to return null (simulates missing data dir)
    vi.mocked(getUserDataDir).mockReturnValue(null);

    // Create expired token to trigger refresh
    const expiredToken = createExpiredToken();
    process.env.VERCEL_OIDC_TOKEN = expiredToken;

    await expect(getVercelOidcToken()).rejects.toThrow(
      /Unable to find user data directory\. Please reach out to Vercel support\./
    );
  });

  test('should throw helpful error when API returns non-200', async () => {
    // Setup: Create both auth.json and project.json
    fs.writeFileSync(
      path.join(cliDataDir, 'auth.json'),
      JSON.stringify({ token: 'test-auth-token' })
    );
    fs.writeFileSync(
      path.join(rootDir, '.vercel', 'project.json'),
      JSON.stringify({ projectId, orgId: teamId })
    );

    // Mock the API call to return error
    vi.spyOn(tokenUtil, 'getVercelOidcToken').mockRejectedValue(
      new Error('Failed to refresh OIDC token: Unauthorized')
    );

    // Create expired token to trigger refresh
    const expiredToken = createExpiredToken();
    process.env.VERCEL_OIDC_TOKEN = expiredToken;

    await expect(getVercelOidcToken()).rejects.toThrow(
      /Failed to refresh OIDC token: Unauthorized/
    );
  });

  test('should throw helpful error when token response is malformed', async () => {
    // Setup: Create both auth.json and project.json
    fs.writeFileSync(
      path.join(cliDataDir, 'auth.json'),
      JSON.stringify({ token: 'test-auth-token' })
    );
    fs.writeFileSync(
      path.join(rootDir, '.vercel', 'project.json'),
      JSON.stringify({ projectId, orgId: teamId })
    );

    // Mock the API call to return malformed response
    vi.spyOn(tokenUtil, 'getVercelOidcToken').mockRejectedValue(
      new TypeError(
        'Vercel OIDC token is malformed. Expected a string-valued token property. Please run `vc env pull` and try again'
      )
    );

    // Create expired token to trigger refresh
    const expiredToken = createExpiredToken();
    process.env.VERCEL_OIDC_TOKEN = expiredToken;

    await expect(getVercelOidcToken()).rejects.toThrow(
      /Vercel OIDC token is malformed\. Expected a string-valued token property\. Please run `vc env pull` and try again/
    );
  });

  test('should throw helpful error when token has invalid format', async () => {
    // Setup: Set an invalid token format (not JWT)
    process.env.VERCEL_OIDC_TOKEN = 'not-a-valid-jwt-token';

    // Mock getTokenPayload to throw error for invalid format
    vi.spyOn(tokenUtil, 'getTokenPayload').mockImplementation(() => {
      throw new Error('Invalid token. Please run `vc env pull` and try again');
    });

    await expect(getVercelOidcToken()).rejects.toThrow(
      /Invalid token\. Please run `vc env pull` and try again/
    );
  });

  test('should throw error when token expiry check fails', async () => {
    // Setup: Invalid token format in env (will fail when checking expiry)
    process.env.VERCEL_OIDC_TOKEN = 'not-a-jwt-token';

    // When getTokenPayload is called, it will throw an error for invalid format
    await expect(getVercelOidcToken()).rejects.toThrow(
      /Invalid token\. Please run `vc env pull` and try again/
    );
  });

  test('should throw error when no token is available initially', async () => {
    // Setup: No token in env (initial sync will fail)
    process.env.VERCEL_OIDC_TOKEN = undefined;

    // When there's no token, it should fail when trying to check if it's expired
    await expect(getVercelOidcToken()).rejects.toThrow(/Invalid token/);
  });

  test('should propagate filesystem errors when saving token fails', async () => {
    // Setup: Create auth.json and project.json
    fs.writeFileSync(
      path.join(cliDataDir, 'auth.json'),
      JSON.stringify({ token: 'test-auth-token' })
    );
    fs.writeFileSync(
      path.join(rootDir, '.vercel', 'project.json'),
      JSON.stringify({ projectId, orgId: teamId })
    );

    // Mock successful API call
    vi.spyOn(tokenUtil, 'getVercelOidcToken').mockResolvedValue({
      token: 'new-valid-token',
    });

    // Mock getTokenPayload to show expired token initially
    vi.spyOn(tokenUtil, 'getTokenPayload').mockReturnValue({
      sub: 'test-sub',
      name: 'test-name',
      exp: Date.now() / 1000 - 1000, // Expired
    });

    // Mock saveToken to throw a filesystem error
    vi.spyOn(tokenUtil, 'saveToken').mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    // Create expired token to trigger refresh
    const expiredToken = createExpiredToken();
    process.env.VERCEL_OIDC_TOKEN = expiredToken;

    await expect(getVercelOidcToken()).rejects.toThrow(/EACCES|permission/i);
  });

  test('should succeed when valid token exists in env', async () => {
    // Setup: Create valid token
    const validToken = createValidToken();
    process.env.VERCEL_OIDC_TOKEN = validToken;

    // Mock getTokenPayload to return valid expiry
    vi.spyOn(tokenUtil, 'getTokenPayload').mockReturnValue({
      sub: 'test-sub',
      name: 'test-name',
      exp: Date.now() / 1000 + 43200, // 12 hours from now
    });

    const token = await getVercelOidcToken();
    expect(token).toBe(validToken);
  });

  test('should refresh when token is expired but all configs are valid', async () => {
    // Setup: Create all required files
    fs.writeFileSync(
      path.join(cliDataDir, 'auth.json'),
      JSON.stringify({ token: 'test-auth-token' })
    );
    fs.writeFileSync(
      path.join(rootDir, '.vercel', 'project.json'),
      JSON.stringify({ projectId, orgId: teamId })
    );

    // Mock successful API call
    const newToken = createValidToken('new-token');
    vi.spyOn(tokenUtil, 'getVercelOidcToken').mockResolvedValue({
      token: newToken,
    });

    // Mock getTokenPayload for both expired and new token
    vi.spyOn(tokenUtil, 'getTokenPayload')
      .mockReturnValueOnce({
        sub: 'test-sub',
        name: 'test-name',
        exp: Date.now() / 1000 - 1000, // Expired 1000 seconds ago
      })
      .mockReturnValue({
        sub: 'test-sub',
        name: 'test-name',
        exp: Date.now() / 1000 + 43200, // 12 hours from now
      });

    // Create expired token
    const expiredToken = createExpiredToken();
    process.env.VERCEL_OIDC_TOKEN = expiredToken;

    const token = await getVercelOidcToken();
    expect(token).toBe(newToken);
  });
});

// Helper functions
function createExpiredToken(): string {
  // Create a JWT-like token structure with expired timestamp
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' })
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'test-sub',
      exp: 1, // Jan 1, 1970 - clearly expired
      iat: 1,
    })
  ).toString('base64url');
  return `${header}.${payload}.fake_signature`;
}

function createValidToken(value = 'valid-token'): string {
  // Create a JWT-like token structure with valid timestamp
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' })
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'test-sub',
      exp: Math.floor(Date.now() / 1000) + 43200, // 12 hours from now
      iat: Math.floor(Date.now() / 1000),
    })
  ).toString('base64url');
  return `${header}.${payload}.fake_signature_${value}`;
}
