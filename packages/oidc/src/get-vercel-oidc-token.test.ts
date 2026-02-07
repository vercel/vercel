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
    if (fs.existsSync(rootDir)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('should throw helpful error when CLI auth file is missing', async () => {
    fs.writeFileSync(
      path.join(rootDir, '.vercel', 'project.json'),
      JSON.stringify({ projectId, orgId: teamId })
    );

    process.env.VERCEL_OIDC_TOKEN = createExpiredToken();

    await expect(getVercelOidcToken()).rejects.toThrow(
      /Failed to refresh OIDC token: Log in to Vercel CLI and link your project with `vc link`/
    );
  });

  test('should throw helpful error when project.json is missing and no existing token', async () => {
    fs.writeFileSync(
      path.join(cliDataDir, 'auth.json'),
      JSON.stringify({ token: 'test-auth-token' })
    );

    // Use an expired token WITHOUT project_id/owner_id to simulate a token
    // that can't provide project info, forcing filesystem fallback
    process.env.VERCEL_OIDC_TOKEN = createExpiredTokenWithoutProjectInfo();

    await expect(getVercelOidcToken()).rejects.toThrow(
      /project\.json not found, have you linked your project with `vc link\?`/
    );
  });

  test('should throw helpful error when root directory cannot be found and no existing token', async () => {
    vi.mocked(findRootDir).mockReturnValue(null);

    // Use an expired token WITHOUT project_id/owner_id to simulate a token
    // that can't provide project info, forcing filesystem fallback
    process.env.VERCEL_OIDC_TOKEN = createExpiredTokenWithoutProjectInfo();

    await expect(getVercelOidcToken()).rejects.toThrow(
      /Unable to find project root directory\. Have you linked your project with `vc link\?`/
    );
  });

  test('should throw helpful error when user data directory cannot be found', async () => {
    fs.writeFileSync(
      path.join(rootDir, '.vercel', 'project.json'),
      JSON.stringify({ projectId, orgId: teamId })
    );

    vi.mocked(getUserDataDir).mockReturnValue(null);
    process.env.VERCEL_OIDC_TOKEN = createExpiredToken();

    await expect(getVercelOidcToken()).rejects.toThrow(
      /Unable to find user data directory\. Please reach out to Vercel support\./
    );
  });

  test('should throw helpful error when API returns non-200', async () => {
    fs.writeFileSync(
      path.join(cliDataDir, 'auth.json'),
      JSON.stringify({ token: 'test-auth-token' })
    );
    fs.writeFileSync(
      path.join(rootDir, '.vercel', 'project.json'),
      JSON.stringify({ projectId, orgId: teamId })
    );

    vi.spyOn(tokenUtil, 'getVercelOidcToken').mockRejectedValue(
      new Error('Failed to refresh OIDC token: Unauthorized')
    );
    process.env.VERCEL_OIDC_TOKEN = createExpiredToken();

    await expect(getVercelOidcToken()).rejects.toThrow(
      /Failed to refresh OIDC token: Unauthorized/
    );
  });

  test('should throw helpful error when token response is malformed', async () => {
    fs.writeFileSync(
      path.join(cliDataDir, 'auth.json'),
      JSON.stringify({ token: 'test-auth-token' })
    );
    fs.writeFileSync(
      path.join(rootDir, '.vercel', 'project.json'),
      JSON.stringify({ projectId, orgId: teamId })
    );

    vi.spyOn(tokenUtil, 'getVercelOidcToken').mockRejectedValue(
      new TypeError(
        'Vercel OIDC token is malformed. Expected a string-valued token property. Please run `vc env pull` and try again'
      )
    );
    process.env.VERCEL_OIDC_TOKEN = createExpiredToken();

    await expect(getVercelOidcToken()).rejects.toThrow(
      /Vercel OIDC token is malformed\. Expected a string-valued token property\. Please run `vc env pull` and try again/
    );
  });

  test('should throw helpful error when token has invalid format', async () => {
    process.env.VERCEL_OIDC_TOKEN = 'not-a-valid-jwt-token';

    vi.spyOn(tokenUtil, 'getTokenPayload').mockImplementation(() => {
      throw new Error('Invalid token. Please run `vc env pull` and try again');
    });

    await expect(getVercelOidcToken()).rejects.toThrow(
      /Invalid token\. Please run `vc env pull` and try again/
    );
  });

  test('should throw error when token expiry check fails', async () => {
    process.env.VERCEL_OIDC_TOKEN = 'not-a-jwt-token';

    await expect(getVercelOidcToken()).rejects.toThrow(
      /Invalid token\. Please run `vc env pull` and try again/
    );
  });

  test('should fail when no token exists and no CLI credentials available', async () => {
    // No token in env, no auth.json, no project.json - completely unconfigured
    process.env.VERCEL_OIDC_TOKEN = undefined;

    await expect(getVercelOidcToken()).rejects.toThrow(/Invalid token/);
  });

  test('should propagate filesystem errors when saving token fails', async () => {
    fs.writeFileSync(
      path.join(cliDataDir, 'auth.json'),
      JSON.stringify({ token: 'test-auth-token' })
    );
    fs.writeFileSync(
      path.join(rootDir, '.vercel', 'project.json'),
      JSON.stringify({ projectId, orgId: teamId })
    );

    vi.spyOn(tokenUtil, 'getVercelOidcToken').mockResolvedValue({
      token: 'new-valid-token',
    });
    vi.spyOn(tokenUtil, 'getTokenPayload').mockReturnValue({
      sub: 'test-sub',
      name: 'test-name',
      exp: Date.now() / 1000 - 1000,
      project_id: projectId,
      owner_id: teamId,
    });
    vi.spyOn(tokenUtil, 'saveToken').mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    process.env.VERCEL_OIDC_TOKEN = createExpiredToken();

    await expect(getVercelOidcToken()).rejects.toThrow(/EACCES|permission/i);
  });

  test('should succeed when valid token exists in env', async () => {
    const validToken = createValidToken();
    process.env.VERCEL_OIDC_TOKEN = validToken;

    vi.spyOn(tokenUtil, 'getTokenPayload').mockReturnValue({
      sub: 'test-sub',
      name: 'test-name',
      exp: Date.now() / 1000 + 43200,
      project_id: projectId,
      owner_id: teamId,
    });

    const token = await getVercelOidcToken();
    expect(token).toBe(validToken);
  });

  test('should refresh when token is expired but all configs are valid', async () => {
    fs.writeFileSync(
      path.join(cliDataDir, 'auth.json'),
      JSON.stringify({ token: 'test-auth-token' })
    );
    fs.writeFileSync(
      path.join(rootDir, '.vercel', 'project.json'),
      JSON.stringify({ projectId, orgId: teamId })
    );

    const newToken = createValidToken('new-token');
    vi.spyOn(tokenUtil, 'getVercelOidcToken').mockResolvedValue({
      token: newToken,
    });
    vi.spyOn(tokenUtil, 'getTokenPayload')
      .mockReturnValueOnce({
        sub: 'test-sub',
        name: 'test-name',
        exp: Date.now() / 1000 - 1000,
        project_id: projectId,
        owner_id: teamId,
      })
      .mockReturnValue({
        sub: 'test-sub',
        name: 'test-name',
        exp: Date.now() / 1000 + 43200,
        project_id: projectId,
        owner_id: teamId,
      });

    process.env.VERCEL_OIDC_TOKEN = createExpiredToken();

    const token = await getVercelOidcToken();
    expect(token).toBe(newToken);
  });
});

function createExpiredToken(
  projectId = 'test-project-id',
  ownerId = 'test-team-id'
): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' })
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'test-sub',
      exp: 1,
      iat: 1,
      project_id: projectId,
      owner_id: ownerId,
    })
  ).toString('base64url');
  return `${header}.${payload}.fake_signature`;
}

function createValidToken(
  value = 'valid-token',
  projectId = 'test-project-id',
  ownerId = 'test-team-id'
): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' })
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'test-sub',
      exp: Math.floor(Date.now() / 1000) + 43200,
      iat: Math.floor(Date.now() / 1000),
      project_id: projectId,
      owner_id: ownerId,
    })
  ).toString('base64url');
  return `${header}.${payload}.fake_signature_${value}`;
}

function createExpiredTokenWithoutProjectInfo(): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' })
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'test-sub',
      exp: 1,
      iat: 1,
      // No project_id or owner_id - forces filesystem fallback
    })
  ).toString('base64url');
  return `${header}.${payload}.fake_signature`;
}
