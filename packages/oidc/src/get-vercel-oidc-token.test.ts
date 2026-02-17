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

  const projectId = 'prj_test123';
  const teamId = 'team_test456';

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

  test('should throw AccessTokenMissingError when CLI auth file is missing', async () => {
    fs.writeFileSync(
      path.join(rootDir, '.vercel', 'project.json'),
      JSON.stringify({ projectId, orgId: teamId })
    );

    process.env.VERCEL_OIDC_TOKEN = createExpiredToken();

    await expect(getVercelOidcToken()).rejects.toThrow(
      /No authentication found/
    );
  });

  test('should throw helpful error when project.json is missing', async () => {
    fs.writeFileSync(
      path.join(cliDataDir, 'auth.json'),
      JSON.stringify({ token: 'test-auth-token' })
    );

    process.env.VERCEL_OIDC_TOKEN = createExpiredToken();

    await expect(getVercelOidcToken()).rejects.toThrow(
      /project\.json not found, have you linked your project with `vc link\?`/
    );
  });

  test('should throw helpful error when root directory cannot be found', async () => {
    vi.mocked(findRootDir).mockReturnValue(null);
    process.env.VERCEL_OIDC_TOKEN = createExpiredToken();

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
      })
      .mockReturnValue({
        sub: 'test-sub',
        name: 'test-name',
        exp: Date.now() / 1000 + 43200,
      });

    process.env.VERCEL_OIDC_TOKEN = createExpiredToken();

    const token = await getVercelOidcToken();
    expect(token).toBe(newToken);
  });

  test('should use provided team and project for refresh instead of reading project.json', async () => {
    const customProjectId = 'prj_custom123';
    const customTeamId = 'team_custom456';

    fs.writeFileSync(
      path.join(cliDataDir, 'auth.json'),
      JSON.stringify({ token: 'test-auth-token' })
    );
    // Note: No project.json file created

    const newToken = createValidToken('custom-token');
    const getVercelOidcTokenSpy = vi
      .spyOn(tokenUtil, 'getVercelOidcToken')
      .mockResolvedValue({
        token: newToken,
      });

    vi.spyOn(tokenUtil, 'getTokenPayload')
      .mockReturnValueOnce({
        sub: 'test-sub',
        name: 'test-name',
        exp: Date.now() / 1000 - 1000,
      })
      .mockReturnValue({
        sub: 'test-sub',
        name: 'test-name',
        exp: Date.now() / 1000 + 43200,
      });

    process.env.VERCEL_OIDC_TOKEN = createExpiredToken();

    const token = await getVercelOidcToken({
      team: customTeamId,
      project: customProjectId,
    });

    expect(token).toBe(newToken);
    expect(getVercelOidcTokenSpy).toHaveBeenCalledWith(
      'test-auth-token',
      customProjectId,
      customTeamId
    );
  });

  test('should use provided project and read team from project.json', async () => {
    const customProjectId = 'prj_custom234';

    fs.writeFileSync(
      path.join(cliDataDir, 'auth.json'),
      JSON.stringify({ token: 'test-auth-token' })
    );
    fs.writeFileSync(
      path.join(rootDir, '.vercel', 'project.json'),
      JSON.stringify({ projectId: 'original-project-id', orgId: teamId })
    );

    const newToken = createValidToken('partial-custom-token');
    const getVercelOidcTokenSpy = vi
      .spyOn(tokenUtil, 'getVercelOidcToken')
      .mockResolvedValue({
        token: newToken,
      });

    vi.spyOn(tokenUtil, 'getTokenPayload')
      .mockReturnValueOnce({
        sub: 'test-sub',
        name: 'test-name',
        exp: Date.now() / 1000 - 1000,
      })
      .mockReturnValue({
        sub: 'test-sub',
        name: 'test-name',
        exp: Date.now() / 1000 + 43200,
      });

    process.env.VERCEL_OIDC_TOKEN = createExpiredToken();

    const token = await getVercelOidcToken({
      project: customProjectId,
    });

    expect(token).toBe(newToken);
    expect(getVercelOidcTokenSpy).toHaveBeenCalledWith(
      'test-auth-token',
      customProjectId,
      teamId
    );
  });

  test('should use provided team and read project from project.json', async () => {
    const customTeamId = 'team_custom789';

    fs.writeFileSync(
      path.join(cliDataDir, 'auth.json'),
      JSON.stringify({ token: 'test-auth-token' })
    );
    fs.writeFileSync(
      path.join(rootDir, '.vercel', 'project.json'),
      JSON.stringify({ projectId, orgId: 'original-team-id' })
    );

    const newToken = createValidToken('partial-custom-token-2');
    const getVercelOidcTokenSpy = vi
      .spyOn(tokenUtil, 'getVercelOidcToken')
      .mockResolvedValue({
        token: newToken,
      });

    vi.spyOn(tokenUtil, 'getTokenPayload')
      .mockReturnValueOnce({
        sub: 'test-sub',
        name: 'test-name',
        exp: Date.now() / 1000 - 1000,
      })
      .mockReturnValue({
        sub: 'test-sub',
        name: 'test-name',
        exp: Date.now() / 1000 + 43200,
      });

    process.env.VERCEL_OIDC_TOKEN = createExpiredToken();

    const token = await getVercelOidcToken({
      team: customTeamId,
    });

    expect(token).toBe(newToken);
    expect(getVercelOidcTokenSpy).toHaveBeenCalledWith(
      'test-auth-token',
      projectId,
      customTeamId
    );
  });

  test('should not refresh when token is valid even with options provided', async () => {
    const validToken = createValidToken();
    process.env.VERCEL_OIDC_TOKEN = validToken;

    const getVercelOidcTokenSpy = vi
      .spyOn(tokenUtil, 'getVercelOidcToken')
      .mockResolvedValue({
        token: 'should-not-be-called',
      });

    vi.spyOn(tokenUtil, 'getTokenPayload').mockReturnValue({
      sub: 'test-sub',
      name: 'test-name',
      exp: Date.now() / 1000 + 43200,
    });

    const token = await getVercelOidcToken({
      team: 'custom-team',
      project: 'custom-project',
    });

    expect(token).toBe(validToken);
    expect(getVercelOidcTokenSpy).not.toHaveBeenCalled();
  });
});

function createExpiredToken(): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' })
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'test-sub',
      exp: 1,
      iat: 1,
    })
  ).toString('base64url');
  return `${header}.${payload}.fake_signature`;
}

function createValidToken(value = 'valid-token'): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' })
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'test-sub',
      exp: Math.floor(Date.now() / 1000) + 43200,
      iat: Math.floor(Date.now() / 1000),
    })
  ).toString('base64url');
  return `${header}.${payload}.fake_signature_${value}`;
}
