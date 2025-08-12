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

    vi.spyOn(tokenUtil, 'getVercelCliToken').mockReturnValue('test');
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
});
