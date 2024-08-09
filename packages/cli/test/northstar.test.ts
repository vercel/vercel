import type http from 'http';
import fs from 'fs-extra';
import path from 'path';
import { parse as parseUrl } from 'url';
import { execCli } from './helpers/exec';
import waitForPrompt from './helpers/wait-for-prompt';
import getGlobalDir from './helpers/get-global-dir';
import { listTmpDirs } from './helpers/get-tmp-dir';
import formatOutput from './helpers/format-output';
import { User } from '@vercel-internals/types';

const binaryPath = path.resolve(__dirname, `../scripts/start.js`);

function getGlobalConfigPath() {
  return path.join(getGlobalDir(), 'config.json');
}

function getConfigAuthPath() {
  return path.join(getGlobalDir(), 'auth.json');
}

beforeEach(async () => {
  try {
    await fs.remove(getGlobalConfigPath());
    await fs.remove(getConfigAuthPath());
  } catch (err) {
    process.exit(1);
  }
});

afterEach(() => {
  if (localApiServer) {
    localApiServer.close();
  }

  const allTmpDirs = listTmpDirs();
  for (const tmpDir of allTmpDirs) {
    tmpDir.removeCallback();
  }
});

function mockApi(user: Partial<User>) {
  return function (req: http.IncomingMessage, res: http.ServerResponse) {
    const { url = '/', method } = req;
    let { pathname = '/', query = {} } = parseUrl(url, true);
    const securityCode = 'Bears Beets Battlestar Galactica';
    res.setHeader('content-type', 'application/json');
    if (
      method === 'POST' &&
      pathname === '/registration' &&
      query.mode === 'login'
    ) {
      res.end(JSON.stringify({ token: 'test', securityCode }));
    } else if (
      method === 'GET' &&
      pathname === '/registration/verify' &&
      query.email === user.email
    ) {
      res.end(JSON.stringify({ token: 'test' }));
    } else if (method === 'GET' && pathname === '/v2/user') {
      res.end(JSON.stringify({ user }));
    } else {
      res.statusCode = 405;
      res.end(JSON.stringify({ code: 'method_not_allowed' }));
    }
  };
}

let localApiServer: any;
function setupLocalApiServer(user: Partial<User>) {
  return new Promise<string>(resolve => {
    localApiServer = require('http')
      .createServer(mockApi(user))
      .listen(0, () => {
        const { port } = localApiServer.address();
        const loginApiUrl = `http://localhost:${port}`;
        resolve(loginApiUrl);
      });
  });
}

async function loginSteps(
  vercel: ReturnType<typeof execCli>,
  user: Partial<User>
) {
  await waitForPrompt(vercel, 'Continue with Email');
  vercel.stdin?.write('\x1B[B'); // Down arrow
  vercel.stdin?.write('\x1B[B'); // Down arrow
  vercel.stdin?.write('\x1B[B'); // Down arrow
  vercel.stdin?.write('\r'); // Return key
  await waitForPrompt(vercel, 'Enter your email address');
  vercel.stdin?.write(user.email);
  vercel.stdin?.write('\r');
  await waitForPrompt(
    vercel,
    `Email authentication complete for ${user.email}`
  );
  return vercel;
}

describe('CLI initialization', () => {
  describe('login required before running a command', () => {
    describe('non-northstar', () => {
      const user = {
        id: 'test-id',
        username: 'test-username',
        email: 'test@example.com',
      };

      it('should not set currentTeam to defaultTeamId', async () => {
        const loginApiUrl = await setupLocalApiServer(user);
        const vercel = execCli(
          binaryPath,
          ['domains', 'invalidSubCommand', '--api', loginApiUrl],
          { env: { FORCE_TTY: '1' } }
        );
        const steps = loginSteps(vercel, user);
        await waitForPrompt(vercel, 'Please specify a valid subcommand');
        const output = await steps;
        expect(output.exitCode, formatOutput(output)).toBe(2);
        const config = await fs.readJSON(getGlobalConfigPath());
        expect(config.currentTeam).toBeUndefined();
      });
    });

    describe('northstar', () => {
      const user = {
        id: 'test-id',
        username: 'test-username',
        email: 'test@example.com',
        version: 'northstar',
        defaultTeamId: 'test-default-team-id',
      };
      it('should set currentTeam to defaultTeamId', async () => {
        const loginApiUrl = await setupLocalApiServer(user);
        const vercel = execCli(
          binaryPath,
          ['domains', 'invalidSubCommand', '--api', loginApiUrl],
          { env: { FORCE_TTY: '1' } }
        );
        const steps = loginSteps(vercel, user);
        await waitForPrompt(vercel, 'Please specify a valid subcommand');
        const output = await steps;
        expect(output.exitCode, formatOutput(output)).toBe(2);
        const config = await fs.readJSON(getGlobalConfigPath());
        expect(config.currentTeam).toEqual(user.defaultTeamId);
      });

      it('should not allow setting user as scope', async () => {
        const loginApiUrl = await setupLocalApiServer(user);
        const vercel = execCli(
          binaryPath,
          [
            'domains',
            'invalidSubCommand',
            '--api',
            loginApiUrl,
            '--scope',
            user.username,
          ],
          { env: { FORCE_TTY: '1' } }
        );
        const steps = loginSteps(vercel, user);
        await waitForPrompt(
          vercel,
          'You cannot set your Personal Account as the scope.'
        );
        const output = await steps;
        expect(output.exitCode, formatOutput(output)).toBe(1);
      });
    });
  });
});
