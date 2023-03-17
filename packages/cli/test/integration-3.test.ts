import path from 'path';
import { parse as parseUrl } from 'url';
import { Readable } from 'stream';
import { tmpdir } from 'os';
import _execa from 'execa';
import XDGAppPaths from 'xdg-app-paths';
import fetch from 'node-fetch';
// @ts-ignore
import tmp from 'tmp-promise';
import retry from 'async-retry';
import fs, { ensureDir } from 'fs-extra';
import prepareFixtures from './helpers/prepare';
import { fetchTokenWithRetry } from '../../../test/lib/deployment/now-deploy';
import type http from 'http';

const TEST_TIMEOUT = 3 * 60 * 1000;
jest.setTimeout(TEST_TIMEOUT);

type BoundChildProcess = _execa.ExecaChildProcess & {
  stdout: Readable;
  stdin: Readable;
  stderr: Readable;
};

interface TmpDir {
  name: string;
  removeCallback: () => void;
}

// log command when running `execa`
function execa(
  file: string,
  args: string[],
  options?: _execa.Options<string>
): BoundChildProcess {
  console.log(`$ vercel ${args.join(' ')}`);
  const proc = _execa(file, args, options);
  if (proc.stdin === null) {
    console.warn(`vercel ${args.join(' ')} - not bound to stdin`);
  }
  if (proc.stdout === null) {
    console.warn(`vercel ${args.join(' ')} - not bound to stdout`);
  }
  if (proc.stderr === null) {
    console.warn(`vercel ${args.join(' ')} - not bound to stderr`);
  }

  // if a reference to `proc.stdout` (for example) fails later,
  // the logs will say clearly where that came from
  // so, it's not awful to use the type assertion here
  return proc as BoundChildProcess;
}

const binaryPath = path.resolve(__dirname, `../scripts/start.js`);

function fetchTokenInformation(token: string, retries = 3) {
  const url = `https://api.vercel.com/v2/user`;
  const headers = { Authorization: `Bearer ${token}` };

  return retry(
    async () => {
      const res = await fetch(url, { headers });

      if (!res.ok) {
        throw new Error(
          `Failed to fetch ${url}, received status ${res.status}`
        );
      }

      const data = await res.json();

      return data.user;
    },
    { retries, factor: 1 }
  );
}

function getTmpDir(): TmpDir {
  return tmp.dirSync({
    // This ensures the directory gets
    // deleted even if it has contents
    unsafeCleanup: true,
  }) as TmpDir;
}

const defaultArgs: string[] = [];
let token: string | undefined;
let email: string | undefined;
let contextName: string | undefined;

let tmpDir: TmpDir | undefined;
let tmpFixturesDir = path.join(tmpdir(), 'tmp-fixtures');

let globalDir = XDGAppPaths('com.vercel.cli').dataDirs()[0];

if (!process.env.CI) {
  tmpDir = getTmpDir();
  globalDir = path.join(tmpDir.name, 'com.vercel.tests');

  defaultArgs.push('-Q', globalDir);
  console.log(
    'No CI detected, adding defaultArgs to avoid polluting user settings',
    defaultArgs
  );
}

function mockLoginApi(req: http.IncomingMessage, res: http.ServerResponse) {
  const { url = '/', method } = req;
  let { pathname = '/', query = {} } = parseUrl(url, true);
  console.log(`[mock-login-server] ${method} ${pathname}`);
  const securityCode = 'Bears Beets Battlestar Galactica';
  res.setHeader('content-type', 'application/json');
  if (
    method === 'POST' &&
    pathname === '/registration' &&
    query.mode === 'login'
  ) {
    res.end(JSON.stringify({ token, securityCode }));
  } else if (
    method === 'GET' &&
    pathname === '/registration/verify' &&
    query.email === email
  ) {
    res.end(JSON.stringify({ token }));
  } else {
    res.statusCode = 405;
    res.end(JSON.stringify({ code: 'method_not_allowed' }));
  }
}

let loginApiUrl = '';
const loginApiServer = require('http')
  .createServer(mockLoginApi)
  .listen(0, () => {
    const { port } = loginApiServer.address();
    loginApiUrl = `http://localhost:${port}`;
    console.log(`[mock-login-server] Listening on ${loginApiUrl}`);
  });

const createUser = async () => {
  await retry(
    async () => {
      if (!fs.existsSync(globalDir)) {
        console.log('Creating global config directory ', globalDir);
        await ensureDir(globalDir);
      } else {
        console.log('Found global config directory ', globalDir);
      }

      token = await fetchTokenWithRetry();

      await fs.writeJSON(getConfigAuthPath(), { token });

      const user = await fetchTokenInformation(token);

      email = user.email;
      contextName = user.username;
    },
    { retries: 3, factor: 1 }
  );
};

const getConfigAuthPath = () => path.join(globalDir, 'auth.json');

beforeAll(async () => {
  try {
    await createUser();
    await prepareFixtures(contextName, binaryPath, tmpFixturesDir);
  } catch (err) {
    console.log('Failed test suite `beforeAll`');
    console.log(err);

    // force test suite to actually stop
    process.exit(1);
  }
});

afterAll(async () => {
  delete process.env.ENABLE_EXPERIMENTAL_COREPACK;

  if (loginApiServer) {
    // Stop mock server
    loginApiServer.close();
  }

  // Make sure the token gets revoked unless it's passed in via environment
  if (!process.env.VERCEL_TOKEN) {
    await execa(binaryPath, ['logout', ...defaultArgs]);
  }

  if (tmpDir) {
    // Remove config directory entirely
    tmpDir.removeCallback();
  }

  if (tmpFixturesDir) {
    console.log('removing tmpFixturesDir', tmpFixturesDir);
    fs.removeSync(tmpFixturesDir);
  }
});

async function clearAuthConfig() {
  const configPath = getConfigAuthPath();
  if (fs.existsSync(configPath)) {
    await fs.writeFile(configPath, JSON.stringify({}));
  }
}

// TESTS: not logged in

test('default command should prompt login with empty auth.json', async () => {
  try {
    await clearAuthConfig();
    await execa(binaryPath, [...defaultArgs]);
    throw new Error(`Expected deploy to fail, but it did not.`);
  } catch (err) {
    expect(err.stderr).toContain(
      'Error: No existing credentials found. Please run `vercel login` or pass "--token"'
    );
  }
});
