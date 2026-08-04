import { randomUUID } from 'crypto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('./token-io');

import { getUserDataDir } from './token-io';
import { getVercelOidcToken, loadToken, saveToken } from './token-util';

describe('token cache hardening', () => {
  let rootDir: string;
  let userDataDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();

    rootDir = path.join(os.tmpdir(), `token-cache-${randomUUID()}`);
    userDataDir = path.join(rootDir, 'data');
    fs.mkdirSync(userDataDir, { recursive: true });
    vi.mocked(getUserDataDir).mockReturnValue(userDataDir);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  test('encodes project and team values in the refresh URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'oidc-token' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await getVercelOidcToken(
      'auth-token',
      'project/with spaces',
      'team&role=owner'
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.vercel.com/v1/projects/project%2Fwith%20spaces/token?source=vercel-oidc-refresh&teamId=team%26role%3Downer',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer auth-token',
        },
      }
    );
  });

  test('stores project token cache entries using encoded file names', () => {
    const projectId = '../com.vercel.cli/auth';
    const token = { token: 'cached-token' };

    saveToken(token, projectId);

    const tokenDir = path.join(userDataDir, 'com.vercel.token');
    const escapedAuthPath = path.join(
      userDataDir,
      'com.vercel.cli',
      'auth.json'
    );
    const tokenPath = path.join(
      tokenDir,
      `${encodeURIComponent(projectId)}.json`
    );

    expect(fs.existsSync(escapedAuthPath)).toBe(false);
    expect(JSON.parse(fs.readFileSync(tokenPath, 'utf8'))).toEqual(token);
    expect(loadToken(projectId)).toEqual(token);

    if (process.platform !== 'win32') {
      expect(fs.statSync(tokenPath).mode & 0o777).toBe(0o600);
    }
  });
});
