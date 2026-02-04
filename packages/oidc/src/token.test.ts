import { randomUUID } from 'crypto';
import { describe, beforeEach, test, vi, expect } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

vi.mock('./token-io');

import { findRootDir, getUserDataDir } from './token-io';
import * as tokenUtil from './token-util';
import { refreshToken } from './token';

describe('refreshToken', () => {
  let rootDir: string;
  let userDataDir: string;
  let cliDataDir: string;
  let tokenDataDir: string;

  const projectId = 'test-project-id';

  beforeEach(() => {
    vi.clearAllMocks();

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

    // write the auth.json file to supply the auth token for the cli
    fs.writeFileSync(path.join(cliDataDir, 'auth.json'), '{token: "test"}');

    // write the project.json file to supply the projectId
    fs.writeFileSync(
      path.join(rootDir, '.vercel', 'project.json'),
      JSON.stringify({ projectId })
    );

    // we can optionally write the token.json file to supply the project token later

    vi.spyOn(process, 'cwd').mockReturnValue(rootDir);
    vi.mocked(findRootDir).mockReturnValue(rootDir);
    vi.mocked(getUserDataDir).mockReturnValue(userDataDir);

    vi.spyOn(tokenUtil, 'getVercelCliToken').mockResolvedValue('test');
    vi.spyOn(tokenUtil, 'getVercelOidcToken').mockResolvedValue({
      token: 'test-token',
    });
    vi.spyOn(tokenUtil, 'getTokenPayload').mockReturnValue({
      sub: 'test-sub',
      name: 'test-name',
      exp: Date.now() + 100000,
    });
  });

  test('should correctly load saved token from file', async () => {
    const token = { token: 'test-saved' };
    const tokenPath = path.join(tokenDataDir, `${projectId}.json`);
    fs.writeFileSync(tokenPath, JSON.stringify(token));

    await refreshToken();
    expect(process.env.VERCEL_OIDC_TOKEN).toBe('test-saved');
  });

  test('should correctly save token to file', async () => {
    await refreshToken();
    expect(process.env.VERCEL_OIDC_TOKEN).toBe('test-token');
    const tokenPath = path.join(tokenDataDir, `${projectId}.json`);
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    expect(token).toEqual({ token: 'test-token' });
  });

  test('should use provided teamId and projectId instead of reading project.json', async () => {
    const customProjectId = 'custom-project';
    const customTeamId = 'custom-team';

    const getVercelOidcTokenSpy = vi.spyOn(tokenUtil, 'getVercelOidcToken');
    const findRootDirSpy = vi.mocked(findRootDir);

    await refreshToken({ teamId: customTeamId, projectId: customProjectId });

    // Should not try to read from project.json when both are provided
    expect(findRootDirSpy).not.toHaveBeenCalled();

    // Should call API with custom values
    expect(getVercelOidcTokenSpy).toHaveBeenCalledWith(
      'test',
      customProjectId,
      customTeamId
    );

    // Should save token with custom projectId
    const tokenPath = path.join(tokenDataDir, `${customProjectId}.json`);
    expect(fs.existsSync(tokenPath)).toBe(true);
    const savedToken = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    expect(savedToken).toEqual({ token: 'test-token' });
  });

  test('should merge provided projectId with teamId from project.json', async () => {
    const customProjectId = 'custom-project';
    const projectTeamId = 'team-from-project';

    fs.writeFileSync(
      path.join(rootDir, '.vercel', 'project.json'),
      JSON.stringify({ projectId, orgId: projectTeamId })
    );

    const getVercelOidcTokenSpy = vi.spyOn(tokenUtil, 'getVercelOidcToken');

    await refreshToken({ projectId: customProjectId });

    // Should read teamId from project.json
    expect(getVercelOidcTokenSpy).toHaveBeenCalledWith(
      'test',
      customProjectId,
      projectTeamId
    );
  });

  test('should merge provided teamId with projectId from project.json', async () => {
    const customTeamId = 'custom-team';
    const projectProjectId = 'project-from-json';

    fs.writeFileSync(
      path.join(rootDir, '.vercel', 'project.json'),
      JSON.stringify({ projectId: projectProjectId, orgId: 'original-team' })
    );

    const getVercelOidcTokenSpy = vi.spyOn(tokenUtil, 'getVercelOidcToken');

    await refreshToken({ teamId: customTeamId });

    // Should read projectId from project.json
    expect(getVercelOidcTokenSpy).toHaveBeenCalledWith(
      'test',
      projectProjectId,
      customTeamId
    );
  });

  test('should use cached token when valid with custom projectId', async () => {
    const customProjectId = 'custom-cached-project';
    const customTeamId = 'custom-cached-team';

    // Save a valid token for the custom project
    const cachedToken = { token: 'cached-valid-token' };
    const tokenPath = path.join(tokenDataDir, `${customProjectId}.json`);
    fs.writeFileSync(tokenPath, JSON.stringify(cachedToken));

    const getVercelOidcTokenSpy = vi.spyOn(tokenUtil, 'getVercelOidcToken');

    await refreshToken({ teamId: customTeamId, projectId: customProjectId });

    // Should not fetch new token since cached one is valid
    expect(getVercelOidcTokenSpy).not.toHaveBeenCalled();
    expect(process.env.VERCEL_OIDC_TOKEN).toBe('cached-valid-token');
  });
});
