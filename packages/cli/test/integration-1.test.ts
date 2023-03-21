import ms from 'ms';
import path from 'path';
import { URL, parse as parseUrl } from 'url';
import semVer from 'semver';
import { Readable } from 'stream';
import { homedir, tmpdir } from 'os';
import _execa from 'execa';
import XDGAppPaths from 'xdg-app-paths';
import fetch, { RequestInfo, RequestInit } from 'node-fetch';
// @ts-ignore
import tmp from 'tmp-promise';
import retry from 'async-retry';
import fs, { ensureDir } from 'fs-extra';
import logo from '../src/util/output/logo';
import sleep from '../src/util/sleep';
import pkg from '../package.json';
import prepareFixtures from './helpers/prepare';
import { fetchTokenWithRetry } from '../../../test/lib/deployment/now-deploy';
import { once } from 'node:events';
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

interface Build {
  use: string;
}

type NowJson = {
  name: string;
};

type DeploymentLike = {
  error?: Error;
  builds: Build[];
};

// log command when running `execa`
function execa(
  file: string,
  args: string[],
  options?: _execa.Options<string>
): BoundChildProcess {
  console.log(`$ vercel ${args.join(' ')}`);
  const proc = _execa(file, args, {
    env: {
      NO_COLOR: '1',
    },
    ...options,
  });
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

function fixture(name: string) {
  const directory = path.join(tmpFixturesDir, name);
  const config = path.join(directory, 'project.json');

  // We need to remove it, otherwise we can't re-use fixtures
  if (fs.existsSync(config)) {
    fs.unlinkSync(config);
  }

  return directory;
}

const binaryPath = path.resolve(__dirname, `../scripts/start.js`);

const deployHelpMessage = `${logo} vercel [options] <command | path>`;
let session = 'temp-session';

const isCanary = pkg.version.includes('canary');

const pickUrl = (stdout: string) => {
  const lines = stdout.split('\n');
  return lines[lines.length - 1];
};

const createFile = (dest: fs.PathLike) => fs.closeSync(fs.openSync(dest, 'w'));

const waitForDeployment = async (href: RequestInfo) => {
  console.log(`waiting for ${href} to become ready...`);
  const start = Date.now();
  const max = ms('4m');
  const inspectorText = '<title>Deployment Overview';

  // eslint-disable-next-line
  while (true) {
    const response = await fetch(href, { redirect: 'manual' });
    const text = await response.text();
    if (response.status === 200 && !text.includes(inspectorText)) {
      break;
    }

    const current = Date.now();

    if (current - start > max || response.status >= 500) {
      throw new Error(
        `Waiting for "${href}" failed since it took longer than 4 minutes.\n` +
          `Received status ${response.status}:\n"${text}"`
      );
    }

    await sleep(2000);
  }
};

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

function formatOutput({
  stderr,
  stdout,
}: {
  stderr: string | Readable;
  stdout: string | Readable;
}) {
  return `
-----

Stderr:
${stderr || '(no output)'}

-----

Stdout:
${stdout || '(no output)'}

-----
  `;
}

async function vcLink(projectPath: string) {
  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    ['link', '--yes', ...defaultArgs],
    {
      reject: false,
      cwd: projectPath,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
}

async function getLocalhost(vc: BoundChildProcess): Promise<RegExpExecArray> {
  let localhost: RegExpExecArray | undefined;
  await waitForPrompt(vc, chunk => {
    const line = chunk.toString();
    if (line.includes('Ready! Available at')) {
      localhost = /(https?:[^\s]+)/g.exec(line) || undefined;
      return true;
    }
    return false;
  });

  // This should never happen because waitForPrompt will time out
  // and never return here in this case, but extra checking is fine
  // and it makes typescript happy
  if (!localhost) {
    throw new Error('Localhost not found!');
  }

  return localhost;
}

function getTmpDir(): TmpDir {
  return tmp.dirSync({
    // This ensures the directory gets
    // deleted even if it has contents
    unsafeCleanup: true,
  }) as TmpDir;
}

const context: {
  deployment: string | undefined;
  secretName: string | undefined;
} = {
  deployment: undefined,
  secretName: undefined,
};

const defaultOptions = { reject: false };
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

const execute = (args: string[], options?: _execa.Options<string>) =>
  execa(binaryPath, [...defaultArgs, ...args], {
    ...defaultOptions,
    ...options,
  });

const apiFetch = (url: string, { headers, ...options }: RequestInit = {}) => {
  return fetch(`https://api.vercel.com${url}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(headers || {}),
    },
    ...options,
  });
};

// the prompt timeout has to be less than the test timeout
const PROMPT_TIMEOUT = TEST_TIMEOUT / 2;

const waitForPrompt = (
  cp: BoundChildProcess,
  assertion: (chunk: Buffer) => boolean
) =>
  new Promise<void>((resolve, reject) => {
    console.log('Waiting for prompt...');
    const handleTimeout = setTimeout(
      () =>
        reject(
          new Error(`timed out after ${PROMPT_TIMEOUT}ms in waitForPrompt`)
        ),
      PROMPT_TIMEOUT
    );

    const listener = (chunk: Buffer) => {
      console.log('> ' + chunk);
      if (assertion(chunk)) {
        cp.stdout.off && cp.stdout.off('data', listener);
        cp.stderr.off && cp.stderr.off('data', listener);
        clearTimeout(handleTimeout);
        resolve();
      }
    };

    cp.stdout.on('data', listener);
    cp.stderr.on('data', listener);
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
      session = Math.random().toString(36).split('.')[1];
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

// NOTE: Test order is important here.
// This test MUST run before the tests below for them to work.
test(
  'login',
  async () => {
    if (!email) {
      throw new Error('Shared state "email" not set.');
    }

    await fs.remove(getConfigAuthPath());
    const loginOutput = await execa(binaryPath, [
      'login',
      email,
      '--api',
      loginApiUrl,
      ...defaultArgs,
    ]);

    expect(loginOutput.exitCode, formatOutput(loginOutput)).toBe(0);
    expect(loginOutput.stderr).toMatch(/You are now logged in\./gm);

    const auth = await fs.readJSON(getConfigAuthPath());
    expect(auth.token).toBe(token);
  },
  60 * 1000
);

test('[vc build] should build project with corepack and select npm@8.1.0', async () => {
  process.env.ENABLE_EXPERIMENTAL_COREPACK = '1';
  const directory = fixture('vc-build-corepack-npm');
  const before = await _execa('npm', ['--version'], {
    cwd: directory,
    reject: false,
  });
  const output = await execute(['build'], { cwd: directory });
  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toMatch(/Build Completed/gm);
  const after = await _execa('npm', ['--version'], {
    cwd: directory,
    reject: false,
  });
  // Ensure global npm didn't change
  expect(before.stdout).toBe(after.stdout);
  // Ensure version is correct
  expect(
    await fs.readFile(
      path.join(directory, '.vercel/output/static/index.txt'),
      'utf8'
    )
  ).toBe('8.1.0\n');
  // Ensure corepack will be cached
  const contents = fs.readdirSync(
    path.join(directory, '.vercel/cache/corepack')
  );
  expect(contents).toEqual(['home', 'shim']);
});

test('[vc build] should build project with corepack and select pnpm@7.1.0', async () => {
  process.env.ENABLE_EXPERIMENTAL_COREPACK = '1';
  const directory = fixture('vc-build-corepack-pnpm');
  const before = await _execa('pnpm', ['--version'], {
    cwd: directory,
    reject: false,
  });
  const output = await execute(['build'], { cwd: directory });
  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toMatch(/Build Completed/gm);
  const after = await _execa('pnpm', ['--version'], {
    cwd: directory,
    reject: false,
  });
  // Ensure global pnpm didn't change
  expect(before.stdout).toBe(after.stdout);
  // Ensure version is correct
  expect(
    await fs.readFile(
      path.join(directory, '.vercel/output/static/index.txt'),
      'utf8'
    )
  ).toBe('7.1.0\n');
  // Ensure corepack will be cached
  const contents = fs.readdirSync(
    path.join(directory, '.vercel/cache/corepack')
  );
  expect(contents).toEqual(['home', 'shim']);
});

test('[vc build] should build project with corepack and select yarn@2.4.3', async () => {
  process.env.ENABLE_EXPERIMENTAL_COREPACK = '1';
  const directory = fixture('vc-build-corepack-yarn');
  const before = await _execa('yarn', ['--version'], {
    cwd: directory,
    reject: false,
  });
  const output = await execute(['build'], { cwd: directory });
  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toMatch(/Build Completed/gm);
  const after = await _execa('yarn', ['--version'], {
    cwd: directory,
    reject: false,
  });
  // Ensure global yarn didn't change
  expect(before.stdout).toBe(after.stdout);
  // Ensure version is correct
  expect(
    await fs.readFile(
      path.join(directory, '.vercel/output/static/index.txt'),
      'utf8'
    )
  ).toBe('2.4.3\n');
  // Ensure corepack will be cached
  const contents = fs.readdirSync(
    path.join(directory, '.vercel/cache/corepack')
  );
  expect(contents).toEqual(['home', 'shim']);
});

test('[vc dev] should print help from `vc develop --help`', async () => {
  const directory = fixture('static-deployment');
  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    ['develop', '--help', ...defaultArgs],
    {
      cwd: directory,
      reject: false,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(2);
  expect(stdout).toMatch(/▲ vercel dev/gm);
});

test('default command should deploy directory', async () => {
  const projectDir = fixture('deploy-default-with-sub-directory');
  const target = 'output';

  await vcLink(path.join(projectDir, target));

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    [
      // omit the default "deploy" command
      target,
      ...defaultArgs,
    ],
    {
      cwd: projectDir,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  expect(stdout).toMatch(/https:\/\/output-.+\.vercel\.app/);
});

test('default command should warn when deploying with conflicting subdirectory', async () => {
  const projectDir = fixture('deploy-default-with-conflicting-sub-directory');
  const target = 'list'; // command that conflicts with a sub directory

  await vcLink(projectDir);

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    [
      // omit the default "deploy" command
      target,
      ...defaultArgs,
    ],
    {
      cwd: projectDir,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  expect(stderr || '').toMatch(
    /Did you mean to deploy the subdirectory "list"\? Use `vc --cwd list` instead./
  );

  const listHeader = /No deployments found/;
  expect(stderr || '').toMatch(listHeader); // ensure `list` command still ran
});

test('deploy command should not warn when deploying with conflicting subdirectory and using --cwd', async () => {
  const projectDir = fixture('deploy-default-with-conflicting-sub-directory');
  const target = 'list'; // command that conflicts with a sub directory

  await vcLink(path.join(projectDir, target));

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    ['list', '--cwd', target, ...defaultArgs],
    {
      cwd: projectDir,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  expect(stderr || '').not.toMatch(
    /Did you mean to deploy the subdirectory "list"\? Use `vc --cwd list` instead./
  );

  const listHeader = /No deployments found/;
  expect(stderr || '').toMatch(listHeader); // ensure `list` command still ran
});

test('default command should work with --cwd option', async () => {
  const projectDir = fixture('deploy-default-with-conflicting-sub-directory');
  const target = 'list'; // command that conflicts with a sub directory

  await vcLink(path.join(projectDir, 'list'));

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    [
      // omit the default "deploy" command
      '--cwd',
      target,
      ...defaultArgs,
    ],
    {
      cwd: projectDir,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  const url = stdout;
  const deploymentResult = await fetch(`${url}/README.md`);
  const body = await deploymentResult.text();
  expect(body).toEqual(
    'readme contents for deploy-default-with-conflicting-sub-directory'
  );
});

test('should allow deploying a directory that was built with a target environment of "preview" and `--prebuilt` is used without specifying a target', async () => {
  const projectDir = fixture('deploy-default-with-prebuilt-preview');

  await vcLink(projectDir);

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    [
      // omit the default "deploy" command
      '--prebuilt',
      ...defaultArgs,
    ],
    {
      cwd: projectDir,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  const url = stdout;
  const deploymentResult = await fetch(`${url}/README.md`);
  const body = await deploymentResult.text();
  expect(body).toEqual(
    'readme contents for deploy-default-with-prebuilt-preview'
  );
});

test('should allow deploying a directory that was prebuilt, but has no builds.json', async () => {
  const projectDir = fixture('build-output-api-raw');

  await vcLink(projectDir);

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    [
      // omit the default "deploy" command
      '--prebuilt',
      ...defaultArgs,
    ],
    {
      cwd: projectDir,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  const url = stdout;
  const deploymentResult = await fetch(`${url}/README.md`);
  const body = await deploymentResult.text();
  expect(body).toEqual('readme contents for build-output-api-raw');
});

test('[vc link] with vercel.json configuration overrides should create a valid deployment', async () => {
  const directory = fixture('vercel-json-configuration-overrides-link');

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    ['link', '--yes', ...defaultArgs],
    {
      reject: false,
      cwd: directory,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  const link = require(path.join(directory, '.vercel/project.json'));

  const resEnv = await apiFetch(`/v4/projects/${link.projectId}`);

  expect(resEnv.status).toBe(200);

  const json = await resEnv.json();

  expect(json.buildCommand).toBe('mkdir public && echo "1" > public/index.txt');
});

test('deploy using only now.json with `redirects` defined', async () => {
  const target = fixture('redirects-v2');

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    [target, ...defaultArgs, '--yes'],
    {
      reject: false,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  const url = stdout;
  const res = await fetch(`${url}/foo/bar`, { redirect: 'manual' });
  const location = res.headers.get('location');
  expect(location).toBe('https://example.com/foo/bar');
});

test('deploy using --local-config flag v2', async () => {
  const target = fixture('local-config-v2');
  const configPath = path.join(target, 'vercel-test.json');

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    ['deploy', target, '--local-config', configPath, ...defaultArgs, '--yes'],
    {
      reject: false,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  const { host } = new URL(stdout);
  expect(host).toMatch(/secondary/gm);

  const testRes = await fetch(`https://${host}/test-${contextName}.html`);
  const testText = await testRes.text();
  expect(testText).toBe('<h1>hello test</h1>');

  const anotherTestRes = await fetch(`https://${host}/another-test`);
  const anotherTestText = await anotherTestRes.text();
  expect(anotherTestText).toBe(testText);

  const mainRes = await fetch(`https://${host}/main-${contextName}.html`);
  expect(mainRes.status).toBe(404);

  const anotherMainRes = await fetch(`https://${host}/another-main`);
  expect(anotherMainRes.status).toBe(404);
});

test('deploy fails using --local-config flag with non-existent path', async () => {
  const target = fixture('local-config-v2');

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    [
      'deploy',
      target,
      '--local-config',
      'does-not-exist.json',
      ...defaultArgs,
      '--yes',
    ],
    {
      reject: false,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);

  expect(stderr).toMatch(
    /Error: Couldn't find a project configuration file at/
  );
  expect(stderr).toMatch(/does-not-exist\.json/);
});

test('deploy using --local-config flag above target', async () => {
  const root = fixture('local-config-above-target');
  const target = path.join(root, 'dir');

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    [
      'deploy',
      target,
      '--local-config',
      './now-root.json',
      ...defaultArgs,
      '--yes',
    ],
    {
      cwd: root,
      reject: false,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  const { host } = new URL(stdout);

  const testRes = await fetch(`https://${host}/index.html`);
  const testText = await testRes.text();
  expect(testText).toBe('<h1>hello index</h1>');

  const anotherTestRes = await fetch(`https://${host}/another.html`);
  const anotherTestText = await anotherTestRes.text();
  expect(anotherTestText).toBe('<h1>hello another</h1>');

  expect(host).toMatch(/root-level/gm);
});

test('Deploy `api-env` fixture and test `vercel env` command', async () => {
  const target = fixture('api-env');

  async function vcLink() {
    const { exitCode, stdout, stderr } = await execa(
      binaryPath,
      ['link', '--yes', ...defaultArgs],
      {
        reject: false,
        cwd: target,
      }
    );
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  async function vcEnvLsIsEmpty() {
    const { exitCode, stdout, stderr } = await execa(
      binaryPath,
      ['env', 'ls', ...defaultArgs],
      {
        reject: false,
        cwd: target,
      }
    );

    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
    expect(stderr).toMatch(/No Environment Variables found in Project/gm);
  }

  async function vcEnvAddWithPrompts() {
    const vc = execa(binaryPath, ['env', 'add', ...defaultArgs], {
      reject: false,
      cwd: target,
    });

    await waitForPrompt(vc, chunk =>
      chunk.includes('What’s the name of the variable?')
    );
    vc.stdin.write('MY_NEW_ENV_VAR\n');
    await waitForPrompt(
      vc,
      chunk =>
        chunk.includes('What’s the value of') &&
        chunk.includes('MY_NEW_ENV_VAR')
    );
    vc.stdin.write('my plaintext value\n');

    await waitForPrompt(
      vc,
      chunk =>
        chunk.includes('which Environments') && chunk.includes('MY_NEW_ENV_VAR')
    );
    vc.stdin.write('a\n'); // select all

    const { exitCode, stdout, stderr } = await vc;

    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  async function vcEnvAddFromStdin() {
    const vc = execa(
      binaryPath,
      ['env', 'add', 'MY_STDIN_VAR', 'development', ...defaultArgs],
      {
        reject: false,
        cwd: target,
      }
    );
    vc.stdin.end('{"expect":"quotes"}');
    const { exitCode, stdout, stderr } = await vc;
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  async function vcEnvAddFromStdinPreview() {
    const vc = execa(
      binaryPath,
      ['env', 'add', 'MY_PREVIEW', 'preview', ...defaultArgs],
      {
        reject: false,
        cwd: target,
      }
    );
    vc.stdin.end('preview-no-branch');
    const { exitCode, stdout, stderr } = await vc;
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  async function vcEnvAddFromStdinPreviewWithBranch() {
    const vc = execa(
      binaryPath,
      ['env', 'add', 'MY_PREVIEW', 'preview', 'staging', ...defaultArgs],
      {
        reject: false,
        cwd: target,
      }
    );
    vc.stdin.end('preview-with-branch');
    const { exitCode, stdout, stderr } = await vc;
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
    expect(stderr).toMatch(/does not have a connected Git repository/gm);
  }

  async function vcEnvLsIncludesVar() {
    const { exitCode, stderr, stdout } = await execa(
      binaryPath,
      ['env', 'ls', ...defaultArgs],
      {
        reject: false,
        cwd: target,
      }
    );

    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
    expect(stderr).toMatch(/Environment Variables found in Project/gm);

    const lines = stdout.split('\n');

    const plaintextEnvs = lines.filter(line => line.includes('MY_NEW_ENV_VAR'));
    expect(plaintextEnvs.length).toBe(1);
    expect(plaintextEnvs[0]).toMatch(/Production, Preview, Development/gm);

    const stdinEnvs = lines.filter(line => line.includes('MY_STDIN_VAR'));
    expect(stdinEnvs.length).toBe(1);
    expect(stdinEnvs[0]).toMatch(/Development/gm);

    const previewEnvs = lines.filter(line => line.includes('MY_PREVIEW'));
    expect(previewEnvs.length).toBe(1);
    expect(previewEnvs[0]).toMatch(/Encrypted .* Preview /gm);
  }

  // we create a "legacy" env variable that contains a decryptable secret
  // to check that vc env pull and vc dev work correctly with decryptable secrets
  async function createEnvWithDecryptableSecret() {
    console.log('creating an env variable with a decryptable secret');

    const name = `my-secret${Math.floor(Math.random() * 10000)}`;

    const res = await apiFetch('/v2/now/secrets', {
      method: 'POST',
      body: JSON.stringify({
        name,
        value: 'decryptable value',
        decryptable: true,
      }),
    });

    expect(res.status).toBe(200);

    const json = await res.json();

    const link = require(path.join(target, '.vercel/project.json'));

    const resEnv = await apiFetch(`/v4/projects/${link.projectId}/env`, {
      method: 'POST',
      body: JSON.stringify({
        key: 'MY_DECRYPTABLE_SECRET_ENV',
        value: json.uid,
        target: ['development'],
        type: 'secret',
      }),
    });

    expect(resEnv.status).toBe(200);
  }

  async function vcEnvPull() {
    const { exitCode, stdout, stderr } = await execa(
      binaryPath,
      ['env', 'pull', '-y', ...defaultArgs],
      {
        reject: false,
        cwd: target,
      }
    );

    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
    expect(stderr).toMatch(/Created .env file/gm);

    const contents = fs.readFileSync(path.join(target, '.env'), 'utf8');
    expect(contents).toMatch(/^# Created by Vercel CLI\n/);
    expect(contents).toMatch(/MY_NEW_ENV_VAR="my plaintext value"/);
    expect(contents).toMatch(/MY_STDIN_VAR="{"expect":"quotes"}"/);
    expect(contents).toMatch(/MY_DECRYPTABLE_SECRET_ENV="decryptable value"/);
    expect(contents).not.toMatch(/MY_PREVIEW/);
  }

  async function vcEnvPullOverwrite() {
    const { exitCode, stdout, stderr } = await execa(
      binaryPath,
      ['env', 'pull', ...defaultArgs],
      {
        reject: false,
        cwd: target,
      }
    );

    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
    expect(stderr).toMatch(/Overwriting existing .env file/gm);
    expect(stderr).toMatch(/Updated .env file/gm);
  }

  async function vcEnvPullConfirm() {
    fs.writeFileSync(path.join(target, '.env'), 'hahaha');

    const vc = execa(binaryPath, ['env', 'pull', ...defaultArgs], {
      reject: false,
      cwd: target,
    });

    await waitForPrompt(vc, chunk =>
      chunk.includes('Found existing file ".env". Do you want to overwrite?')
    );
    vc.stdin.end('y\n');

    const { exitCode, stdout, stderr } = await vc;
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  async function vcDeployWithVar() {
    const { exitCode, stdout, stderr } = await execa(
      binaryPath,
      [...defaultArgs],
      {
        reject: false,
        cwd: target,
      }
    );
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
    const { host } = new URL(stdout);

    const apiUrl = `https://${host}/api/get-env`;
    const apiRes = await fetch(apiUrl);
    expect(apiRes.status, apiUrl).toBe(200);
    const apiJson = await apiRes.json();
    expect(apiJson['MY_NEW_ENV_VAR']).toBe('my plaintext value');

    const homeUrl = `https://${host}`;
    const homeRes = await fetch(homeUrl);
    expect(homeRes.status, homeUrl).toBe(200);
    const homeJson = await homeRes.json();
    expect(homeJson['MY_NEW_ENV_VAR']).toBe('my plaintext value');
  }

  async function vcDevWithEnv() {
    const vc = execa(binaryPath, ['dev', '--debug', ...defaultArgs], {
      reject: false,
      cwd: target,
    });

    const localhost = await getLocalhost(vc);
    const apiUrl = `${localhost[0]}/api/get-env`;
    const apiRes = await fetch(apiUrl);

    expect(apiRes.status).toBe(200);

    const apiJson = await apiRes.json();

    expect(apiJson['MY_NEW_ENV_VAR']).toBe('my plaintext value');
    expect(apiJson['MY_DECRYPTABLE_SECRET_ENV']).toBe('decryptable value');

    const homeUrl = localhost[0];

    const homeRes = await fetch(homeUrl);
    const homeJson = await homeRes.json();
    expect(homeJson['MY_NEW_ENV_VAR']).toBe('my plaintext value');
    expect(homeJson['MY_DECRYPTABLE_SECRET_ENV']).toBe('decryptable value');

    // sleep before kill, otherwise the dev process doesn't clean up and exit properly
    await sleep(100);
    vc.kill('SIGTERM', { forceKillAfterTimeout: 5000 });

    const { exitCode, stdout, stderr } = await vc;
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  async function vcDevAndFetchCloudVars() {
    const vc = execa(binaryPath, ['dev', ...defaultArgs], {
      reject: false,
      cwd: target,
    });

    const localhost = await getLocalhost(vc);
    const apiUrl = `${localhost[0]}/api/get-env`;
    const apiRes = await fetch(apiUrl);
    expect(apiRes.status).toBe(200);

    const apiJson = await apiRes.json();
    expect(apiJson['MY_NEW_ENV_VAR']).toBe('my plaintext value');
    expect(apiJson['MY_STDIN_VAR']).toBe('{"expect":"quotes"}');
    expect(apiJson['MY_DECRYPTABLE_SECRET_ENV']).toBe('decryptable value');

    const homeUrl = localhost[0];
    const homeRes = await fetch(homeUrl);
    const homeJson = await homeRes.json();
    expect(homeJson['MY_NEW_ENV_VAR']).toBe('my plaintext value');
    expect(homeJson['MY_STDIN_VAR']).toBe('{"expect":"quotes"}');
    expect(homeJson['MY_DECRYPTABLE_SECRET_ENV']).toBe('decryptable value');

    // system env vars are automatically exposed
    expect(apiJson['VERCEL']).toBe('1');
    expect(homeJson['VERCEL']).toBe('1');

    // sleep before kill, otherwise the dev process doesn't clean up and exit properly
    await sleep(100);
    vc.kill('SIGTERM', { forceKillAfterTimeout: 5000 });

    const { exitCode, stdout, stderr } = await vc;
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  async function enableAutoExposeSystemEnvs() {
    const link = require(path.join(target, '.vercel/project.json'));

    const res = await apiFetch(`/v2/projects/${link.projectId}`, {
      method: 'PATCH',
      body: JSON.stringify({ autoExposeSystemEnvs: true }),
    });

    expect(res.status).toBe(200);
    if (res.status === 200) {
      console.log(
        `Set autoExposeSystemEnvs=true for project ${link.projectId}`
      );
    }
  }

  async function vcEnvPullFetchSystemVars() {
    const { exitCode, stdout, stderr } = await execa(
      binaryPath,
      ['env', 'pull', '-y', ...defaultArgs],
      {
        reject: false,
        cwd: target,
      }
    );

    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

    const contents = fs.readFileSync(path.join(target, '.env'), 'utf8');

    const lines = new Set(contents.split('\n'));

    expect(lines).toContain('VERCEL="1"');
    expect(lines).toContain('VERCEL_URL=""');
    expect(lines).toContain('VERCEL_ENV="development"');
    expect(lines).toContain('VERCEL_GIT_PROVIDER=""');
    expect(lines).toContain('VERCEL_GIT_REPO_SLUG=""');
  }

  async function vcDevAndFetchSystemVars() {
    const vc = execa(binaryPath, ['dev', ...defaultArgs], {
      reject: false,
      cwd: target,
    });

    const localhost = await getLocalhost(vc);
    const apiUrl = `${localhost[0]}/api/get-env`;
    const apiRes = await fetch(apiUrl);

    const localhostNoProtocol = localhost[0].slice('http://'.length);

    const apiJson = await apiRes.json();
    expect(apiJson['VERCEL']).toBe('1');
    expect(apiJson['VERCEL_URL']).toBe(localhostNoProtocol);
    expect(apiJson['VERCEL_ENV']).toBe('development');
    expect(apiJson['VERCEL_REGION']).toBe('dev1');
    expect(apiJson['VERCEL_GIT_PROVIDER']).toBe('');
    expect(apiJson['VERCEL_GIT_REPO_SLUG']).toBe('');

    const homeUrl = localhost[0];
    const homeRes = await fetch(homeUrl);
    const homeJson = await homeRes.json();
    expect(homeJson['VERCEL']).toBe('1');
    expect(homeJson['VERCEL_URL']).toBe(localhostNoProtocol);
    expect(homeJson['VERCEL_ENV']).toBe('development');
    expect(homeJson['VERCEL_REGION']).toBe(undefined);
    expect(homeJson['VERCEL_GIT_PROVIDER']).toBe('');
    expect(homeJson['VERCEL_GIT_REPO_SLUG']).toBe('');

    // sleep before kill, otherwise the dev process doesn't clean up and exit properly
    await sleep(100);
    vc.kill('SIGTERM', { forceKillAfterTimeout: 5000 });

    const { exitCode, stdout, stderr } = await vc;
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  async function vcEnvRemove() {
    const vc = execa(binaryPath, ['env', 'rm', '-y', ...defaultArgs], {
      reject: false,
      cwd: target,
    });
    await waitForPrompt(vc, chunk =>
      chunk.includes('What’s the name of the variable?')
    );
    vc.stdin.write('MY_PREVIEW\n');
    const { exitCode, stdout, stderr } = await vc;
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  async function vcEnvRemoveWithArgs() {
    const { exitCode, stdout, stderr } = await execa(
      binaryPath,
      ['env', 'rm', 'MY_STDIN_VAR', 'development', '-y', ...defaultArgs],
      {
        reject: false,
        cwd: target,
      }
    );

    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

    const { exitCode: exitCode3 } = await execa(
      binaryPath,
      [
        'env',
        'rm',
        'MY_DECRYPTABLE_SECRET_ENV',
        'development',
        '-y',
        ...defaultArgs,
      ],
      {
        reject: false,
        cwd: target,
      }
    );

    expect(exitCode3).toBe(0);
  }

  async function vcEnvRemoveWithNameOnly() {
    const { exitCode, stdout, stderr } = await execa(
      binaryPath,
      ['env', 'rm', 'MY_NEW_ENV_VAR', '-y', ...defaultArgs],
      {
        reject: false,
        cwd: target,
      }
    );

    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  function vcEnvRemoveByName(name: string) {
    return execa(binaryPath, ['env', 'rm', name, '-y', ...defaultArgs], {
      reject: false,
      cwd: target,
    });
  }

  async function vcEnvRemoveAll() {
    await vcEnvRemoveByName('MY_PREVIEW');
    await vcEnvRemoveByName('MY_STDIN_VAR');
    await vcEnvRemoveByName('MY_DECRYPTABLE_SECRET_ENV');
    await vcEnvRemoveByName('MY_NEW_ENV_VAR');
  }

  try {
    await vcEnvRemoveAll();
    await vcLink();
    await vcEnvLsIsEmpty();
    await vcEnvAddWithPrompts();
    await vcEnvAddFromStdin();
    await vcEnvAddFromStdinPreview();
    await vcEnvAddFromStdinPreviewWithBranch();
    await vcEnvLsIncludesVar();
    await createEnvWithDecryptableSecret();
    await vcEnvPull();
    await vcEnvPullOverwrite();
    await vcEnvPullConfirm();
    await vcDeployWithVar();
    await vcDevWithEnv();
    fs.unlinkSync(path.join(target, '.env'));
    await vcDevAndFetchCloudVars();
    await enableAutoExposeSystemEnvs();
    await vcEnvPullFetchSystemVars();
    fs.unlinkSync(path.join(target, '.env'));
    await vcDevAndFetchSystemVars();
    await vcEnvRemove();
    await vcEnvRemoveWithArgs();
    await vcEnvRemoveWithNameOnly();
    await vcEnvLsIsEmpty();
  } finally {
    await vcEnvRemoveAll();
  }
});

test('[vc projects] should create a project successfully', async () => {
  const projectName = `vc-projects-add-${
    Math.random().toString(36).split('.')[1]
  }`;

  const vc = execa(binaryPath, ['project', 'add', projectName, ...defaultArgs]);

  await waitForPrompt(vc, chunk =>
    chunk.includes(`Success! Project ${projectName} added`)
  );

  const { exitCode, stdout, stderr } = await vc;
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  // creating the same project again should succeed
  const vc2 = execa(binaryPath, [
    'project',
    'add',
    projectName,
    ...defaultArgs,
  ]);

  await waitForPrompt(vc2, chunk =>
    chunk.includes(`Success! Project ${projectName} added`)
  );

  const { exitCode: exitCode2 } = await vc;
  expect(exitCode2).toBe(0);
});

test('deploy with metadata containing "=" in the value', async () => {
  const target = fixture('static-v2-meta');

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    [target, ...defaultArgs, '--yes', '--meta', 'someKey=='],
    { reject: false }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  const { host } = new URL(stdout);
  const res = await fetch(
    `https://api.vercel.com/v12/now/deployments/get?url=${host}`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  const deployment = await res.json();
  expect(deployment.meta.someKey).toBe('=');
});

test('print the deploy help message', async () => {
  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    ['help', ...defaultArgs],
    {
      reject: false,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(2);
  expect(stderr).toContain(deployHelpMessage);
  expect(stderr).not.toContain('ExperimentalWarning');
});

test('output the version', async () => {
  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    ['--version', ...defaultArgs],
    {
      reject: false,
    }
  );

  const version = stdout.trim();

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  expect(semVer.valid(version)).toBeTruthy();
  expect(version).toBe(pkg.version);
});

test('should add secret with hyphen prefix', async () => {
  const target = fixture('build-secret');
  const key = 'mysecret';
  const value = '-foo_bar';

  let secretCall = await execa(
    binaryPath,
    ['secrets', 'add', ...defaultArgs, key, value],
    {
      cwd: target,
      reject: false,
    }
  );

  expect(secretCall.exitCode, formatOutput(secretCall)).toBe(0);

  let targetCall = await execa(binaryPath, [...defaultArgs, '--yes'], {
    cwd: target,
    reject: false,
  });

  expect(targetCall.exitCode, formatOutput(targetCall)).toBe(0);
  const { host } = new URL(targetCall.stdout);
  const response = await fetch(`https://${host}`);
  expect(response.status).toBe(200);
  expect(await response.text()).toBe(`${value}\n`);
});

test('login with unregistered user', async () => {
  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    ['login', `${session}@${session}.com`, ...defaultArgs],
    {
      reject: false,
    }
  );

  const goal = `Error: Please sign up: https://vercel.com/signup`;
  const lines = stderr.trim().split('\n');
  const last = lines[lines.length - 1];

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(last).toContain(goal);
});

test('ignore files specified in .nowignore', async () => {
  const directory = fixture('nowignore');

  const args = [
    '--debug',
    '--public',
    '--name',
    session,
    ...defaultArgs,
    '--yes',
  ];
  const targetCall = await execa(binaryPath, args, {
    cwd: directory,
    reject: false,
  });

  const { host } = new URL(targetCall.stdout);
  const ignoredFile = await fetch(`https://${host}/ignored.txt`);
  expect(ignoredFile.status).toBe(404);

  const presentFile = await fetch(`https://${host}/index.txt`);
  expect(presentFile.status).toBe(200);
});

test('ignore files specified in .nowignore via allowlist', async () => {
  const directory = fixture('nowignore-allowlist');

  const args = [
    '--debug',
    '--public',
    '--name',
    session,
    ...defaultArgs,
    '--yes',
  ];
  const targetCall = await execa(binaryPath, args, {
    cwd: directory,
    reject: false,
  });

  const { host } = new URL(targetCall.stdout);
  const ignoredFile = await fetch(`https://${host}/ignored.txt`);
  expect(ignoredFile.status).toBe(404);

  const presentFile = await fetch(`https://${host}/index.txt`);
  expect(presentFile.status).toBe(200);
});

test('list the scopes', async () => {
  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    ['teams', 'ls', ...defaultArgs],
    {
      reject: false,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  const include = new RegExp(`✔ ${contextName}\\s+${email}`);
  expect(stdout).toMatch(include);
});

test('domains inspect', async () => {
  const domainName = `inspect-${contextName}-${Math.random()
    .toString()
    .slice(2, 8)}.org`;

  const directory = fixture('static-multiple-files');
  const projectName = Math.random().toString().slice(2);

  const output = await execute([
    directory,
    `-V`,
    `2`,
    `--name=${projectName}`,
    '--yes',
    '--public',
  ]);
  expect(output.exitCode, formatOutput(output)).toBe(0);

  {
    // Add a domain that can be inspected
    const result = await execa(
      binaryPath,
      [`domains`, `add`, domainName, projectName, ...defaultArgs],
      { reject: false }
    );

    expect(result.exitCode, formatOutput(result)).toBe(0);
  }

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    ['domains', 'inspect', domainName, ...defaultArgs],
    {
      reject: false,
    }
  );

  expect(stderr).toContain(`Renewal Price`);
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  {
    // Remove the domain again
    const result = await execa(
      binaryPath,
      [`domains`, `rm`, domainName, ...defaultArgs],
      { reject: false, input: 'y' }
    );

    expect(result.exitCode, formatOutput(result)).toBe(0);
  }
});

test('try to purchase a domain', async () => {
  if (process.env.VERCEL_TOKEN || process.env.NOW_TOKEN) {
    console.log(
      'Skipping test `try to purchase a domain` because a personal VERCEL_TOKEN was provided.'
    );
    return;
  }

  const stream = new Readable();
  stream._read = () => {};

  setTimeout(async () => {
    await sleep(ms('1s'));
    stream.push('y');
    await sleep(ms('1s'));
    stream.push('y');
    stream.push(null);
  }, ms('1s'));

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    ['domains', 'buy', `${session}-test.com`, ...defaultArgs],
    {
      reject: false,
      input: stream,
      env: {
        FORCE_TTY: '1',
      },
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(stderr).toMatch(
    /Error: Could not purchase domain\. Please add a payment method using/
  );
});

test('try to transfer-in a domain with "--code" option', async () => {
  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [
      'domains',
      'transfer-in',
      '--code',
      'xyz',
      `${session}-test.com`,
      ...defaultArgs,
    ],
    {
      reject: false,
    }
  );

  expect(stderr).toContain(
    `Error: The domain "${session}-test.com" is not transferable.`
  );
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
});

test('try to move an invalid domain', async () => {
  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [
      'domains',
      'move',
      `${session}-invalid-test.org`,
      `${session}-invalid-user`,
      ...defaultArgs,
    ],
    {
      reject: false,
    }
  );

  expect(stderr).toContain(`Error: Domain not found under `);
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
});

/*
 * Disabled 2 tests because these temp users don't have certs
test('create wildcard alias for deployment', async t => {
  const hosts = {
    deployment: context.deployment,
    alias: `*.${contextName}.now.sh`,
  };
  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    ['alias', hosts.deployment, hosts.alias, ...defaultArgs],
    {
      reject: false,
    }
  );
  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);
  const goal = `> Success! ${hosts.alias} now points to https://${hosts.deployment}`;
  t.is(exitCode, 0);
  t.true(stdout.startsWith(goal));
  // Send a test request to the alias
  // Retries to make sure we consider the time it takes to update
  const response = await retry(
    async () => {
      const response = await fetch(`https://test.${contextName}.now.sh`);
      if (response.ok) {
        return response;
      }
      throw new Error(`Error: Returned code ${response.status}`);
    },
    { retries: 3 }
  );
  const content = await response.text();
  t.true(response.ok);
  t.true(content.includes(contextName));
  context.wildcardAlias = hosts.alias;
});
test('remove the wildcard alias', async t => {
  const goal = `> Success! Alias ${context.wildcardAlias} removed`;
  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    ['alias', 'rm', context.wildcardAlias, '--yes', ...defaultArgs],
    {
      reject: false,
    }
  );
  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);
  t.is(exitCode, 0);
  t.true(stdout.startsWith(goal));
});
*/

test('ensure we render a warning for deployments with no files', async () => {
  const directory = fixture('empty-directory');

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [
      directory,
      '--public',
      '--name',
      session,
      ...defaultArgs,
      '--yes',
      '--force',
    ],
    {
      reject: false,
    }
  );

  // Ensure the warning is printed
  expect(stderr).toMatch(/There are no files inside your deployment/);

  // Test if the output is really a URL
  const { href, host } = new URL(stdout);
  expect(host.split('-')[0]).toBe(session);

  if (host) {
    context.deployment = host;
  }

  // Ensure the exit code is right
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  // Send a test request to the deployment
  const res = await fetch(href);
  expect(res.status).toBe(404);
});

test('output logs with "short" output', async () => {
  if (!context.deployment) {
    throw new Error('Shared state "context.deployment" not set.');
  }

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    ['logs', context.deployment, ...defaultArgs],
    {
      reject: false,
    }
  );

  expect(stderr).toContain(`Fetched deployment "${context.deployment}"`);

  // "short" format includes timestamps
  expect(
    stdout.match(
      /\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z)/
    )
  ).toBeTruthy();

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
});

test('output logs with "raw" output', async () => {
  if (!context.deployment) {
    throw new Error('Shared state "context.deployment" not set.');
  }

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    ['logs', context.deployment, ...defaultArgs, '--output', 'raw'],
    {
      reject: false,
    }
  );

  expect(stderr).toContain(`Fetched deployment "${context.deployment}"`);

  // "raw" format does not include timestamps
  expect(null).toBe(
    stdout.match(
      /\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z)/
    )
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
});

test('ensure we render a prompt when deploying home directory', async () => {
  const directory = homedir();

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [directory, '--public', '--name', session, ...defaultArgs, '--force'],
    {
      reject: false,
      input: 'N',
    }
  );

  // Ensure the exit code is right
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  expect(stderr).toContain(
    'You are deploying your home directory. Do you want to continue? [y/N]'
  );
  expect(stderr).toContain('Canceled');
});

test('ensure the `scope` property works with email', async () => {
  const directory = fixture('config-scope-property-email');

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [
      directory,
      '--public',
      '--name',
      session,
      ...defaultArgs,
      '--force',
      '--yes',
    ],
    {
      reject: false,
    }
  );

  // Ensure we're deploying under the right scope
  expect(stderr).toContain(session);

  // Ensure the exit code is right
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  // Test if the output is really a URL
  const { href, host } = new URL(stdout);
  expect(host.split('-')[0]).toBe(session);

  // Send a test request to the deployment
  const response = await fetch(href);
  const contentType = response.headers.get('content-type');

  expect(contentType).toBe('text/html; charset=utf-8');
});

test('ensure the `scope` property works with username', async () => {
  const directory = fixture('config-scope-property-username');

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [
      directory,
      '--public',
      '--name',
      session,
      ...defaultArgs,
      '--force',
      '--yes',
    ],
    {
      reject: false,
    }
  );

  // Ensure we're deploying under the right scope
  expect(stderr).toContain(contextName);

  // Ensure the exit code is right
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  // Test if the output is really a URL
  const { href, host } = new URL(stdout);
  expect(host.split('-')[0]).toBe(session);

  // Send a test request to the deployment
  const response = await fetch(href);
  const contentType = response.headers.get('content-type');

  expect(contentType).toBe('text/html; charset=utf-8');
});

test('try to create a builds deployments with wrong now.json', async () => {
  const directory = fixture('builds-wrong');

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [directory, '--public', ...defaultArgs, '--yes'],
    {
      reject: false,
    }
  );

  // Ensure the exit code is right
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(stderr).toContain(
    'Error: Invalid now.json - should NOT have additional property `builder`. Did you mean `builds`?'
  );
  expect(stderr).toContain(
    'https://vercel.com/docs/concepts/projects/project-configuration'
  );
});

test('try to create a builds deployments with wrong vercel.json', async () => {
  const directory = fixture('builds-wrong-vercel');

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [directory, '--public', ...defaultArgs, '--yes'],
    {
      reject: false,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(stderr).toContain(
    'Error: Invalid vercel.json - should NOT have additional property `fake`. Please remove it.'
  );
  expect(stderr).toContain(
    'https://vercel.com/docs/concepts/projects/project-configuration'
  );
});

test('try to create a builds deployments with wrong `build.env` property', async () => {
  const directory = fixture('builds-wrong-build-env');

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    ['--public', ...defaultArgs, '--yes'],
    {
      cwd: directory,
      reject: false,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(stderr).toContain(
    'Error: Invalid vercel.json - should NOT have additional property `build.env`. Did you mean `{ "build": { "env": {"name": "value"} } }`?'
  );
  expect(stderr).toContain(
    'https://vercel.com/docs/concepts/projects/project-configuration'
  );
});

test('create a builds deployments with no actual builds', async () => {
  const directory = fixture('builds-no-list');

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    [
      directory,
      '--public',
      '--name',
      session,
      ...defaultArgs,
      '--force',
      '--yes',
    ],
    {
      reject: false,
    }
  );

  // Ensure the exit code is right
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  // Test if the output is really a URL
  const { host } = new URL(stdout);
  expect(host.split('-')[0]).toBe(session);
});

test('create a staging deployment', async () => {
  const directory = fixture('static-deployment');

  const args = ['--debug', '--public', '--name', session, ...defaultArgs];
  const targetCall = await execa(binaryPath, [
    directory,
    '--target=staging',
    ...args,
    '--yes',
  ]);

  expect(targetCall.stderr).toMatch(/Setting target to staging/gm);
  expect(targetCall.stdout).toMatch(/https:\/\//gm);
  expect(targetCall.exitCode, formatOutput(targetCall)).toBe(0);

  const { host } = new URL(targetCall.stdout);
  const deployment = await apiFetch(
    `/v10/now/deployments/unknown?url=${host}`
  ).then(resp => resp.json());
  expect(deployment.target).toBe('staging');
});

test('create a production deployment', async () => {
  const directory = fixture('static-deployment');

  const args = ['--debug', '--public', '--name', session, ...defaultArgs];
  const targetCall = await execa(binaryPath, [
    directory,
    '--target=production',
    ...args,
    '--yes',
  ]);

  expect(targetCall.exitCode, formatOutput(targetCall)).toBe(0);
  expect(targetCall.stderr).toMatch(/`--prod` option instead/gm);
  expect(targetCall.stderr).toMatch(/Setting target to production/gm);
  expect(targetCall.stderr).toMatch(/Inspect: https:\/\/vercel.com\//gm);
  expect(targetCall.stdout).toMatch(/https:\/\//gm);

  const { host: targetHost } = new URL(targetCall.stdout);
  const targetDeployment = await apiFetch(
    `/v10/now/deployments/unknown?url=${targetHost}`
  ).then(resp => resp.json());
  expect(targetDeployment.target).toBe('production');

  const call = await execa(binaryPath, [directory, '--prod', ...args]);

  expect(call.exitCode, formatOutput(call)).toBe(0);
  expect(call.stderr).toMatch(/Setting target to production/gm);
  expect(call.stdout).toMatch(/https:\/\//gm);

  const { host } = new URL(call.stdout);
  const deployment = await apiFetch(
    `/v10/now/deployments/unknown?url=${host}`
  ).then(resp => resp.json());
  expect(deployment.target).toBe('production');
});

test('use build-env', async () => {
  const directory = fixture('build-env');

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    [directory, '--public', ...defaultArgs, '--yes'],
    {
      reject: false,
    }
  );

  // Ensure the exit code is right
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  // Test if the output is really a URL
  const deploymentUrl = pickUrl(stdout);
  const { href } = new URL(deploymentUrl);

  await waitForDeployment(href);

  // get the content
  const response = await fetch(href);
  const content = await response.text();
  expect(content.trim()).toBe('bar');
});

test('try to deploy non-existing path', async () => {
  const goal = `Error: The specified file or directory "${session}" does not exist.`;

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [session, ...defaultArgs, '--yes'],
    {
      reject: false,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(stderr.trim().endsWith(goal), `should end with "${goal}"`).toBe(true);
});

test('try to deploy with non-existing team', async () => {
  const target = fixture('static-deployment');
  const goal = `Error: The specified scope does not exist`;

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [target, '--scope', session, ...defaultArgs, '--yes'],
    {
      reject: false,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(stderr).toContain(goal);
});

test('initialize example "angular"', async () => {
  tmpDir = getTmpDir();
  const cwd = tmpDir.name;
  const goal = '> Success! Initialized "angular" example in';

  const { exitCode, stdout, stderr } = await execute(['init', 'angular'], {
    cwd,
  });

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  expect(stderr).toContain(goal);

  expect(
    fs.existsSync(path.join(cwd, 'angular', 'package.json')),
    'package.json'
  ).toBe(true);
  expect(
    fs.existsSync(path.join(cwd, 'angular', 'tsconfig.json')),
    'tsconfig.json'
  ).toBe(true);
  expect(
    fs.existsSync(path.join(cwd, 'angular', 'angular.json')),
    'angular.json'
  ).toBe(true);
});

test('initialize example ("angular") to specified directory', async () => {
  tmpDir = getTmpDir();
  const cwd = tmpDir.name;
  const goal = '> Success! Initialized "angular" example in';

  const { exitCode, stdout, stderr } = await execute(
    ['init', 'angular', 'ang'],
    {
      cwd,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  expect(stderr).toContain(goal);

  expect(
    fs.existsSync(path.join(cwd, 'ang', 'package.json')),
    'package.json'
  ).toBe(true);
  expect(
    fs.existsSync(path.join(cwd, 'ang', 'tsconfig.json')),
    'tsconfig.json'
  ).toBe(true);
  expect(
    fs.existsSync(path.join(cwd, 'ang', 'angular.json')),
    'angular.json'
  ).toBe(true);
});

test('initialize example to existing directory with "-f"', async () => {
  tmpDir = getTmpDir();
  const cwd = tmpDir.name;
  const goal = '> Success! Initialized "angular" example in';

  await ensureDir(path.join(cwd, 'angular'));
  createFile(path.join(cwd, 'angular', '.gitignore'));
  const { exitCode, stdout, stderr } = await execute(
    ['init', 'angular', '-f'],
    {
      cwd,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  expect(stderr).toContain(goal);

  expect(
    fs.existsSync(path.join(cwd, 'angular', 'package.json')),
    'package.json'
  ).toBe(true);
  expect(
    fs.existsSync(path.join(cwd, 'angular', 'tsconfig.json')),
    'tsconfig.json'
  ).toBe(true);
  expect(
    fs.existsSync(path.join(cwd, 'angular', 'angular.json')),
    'angular.json'
  ).toBe(true);
});

test('try to initialize example to existing directory', async () => {
  tmpDir = getTmpDir();
  const cwd = tmpDir.name;
  const goal =
    'Error: Destination path "angular" already exists and is not an empty directory. You may use `--force` or `-f` to override it.';

  await ensureDir(path.join(cwd, 'angular'));
  createFile(path.join(cwd, 'angular', '.gitignore'));
  const { exitCode, stdout, stderr } = await execute(['init', 'angular'], {
    cwd,
    input: '\n',
  });

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(stderr).toContain(goal);
});

test('try to initialize misspelled example (noce) in non-tty', async () => {
  tmpDir = getTmpDir();
  const cwd = tmpDir.name;
  const goal =
    'Error: No example found for noce, run `vercel init` to see the list of available examples.';

  const { stdout, stderr, exitCode } = await execute(['init', 'noce'], { cwd });

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(stderr).toContain(goal);
});

test('try to initialize example "example-404"', async () => {
  tmpDir = getTmpDir();
  const cwd = tmpDir.name;
  const goal =
    'Error: No example found for example-404, run `vercel init` to see the list of available examples.';

  const { exitCode, stdout, stderr } = await execute(['init', 'example-404'], {
    cwd,
  });

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(stderr).toContain(goal);
});

test('try to revert a deployment and assign the automatic aliases', async () => {
  const firstDeployment = fixture('now-revert-alias-1');
  const secondDeployment = fixture('now-revert-alias-2');

  const { name } = JSON.parse(
    fs.readFileSync(path.join(firstDeployment, 'now.json')).toString()
  ) as NowJson;
  expect(name).toBeTruthy();

  const url = `https://${name}.user.vercel.app`;

  {
    const { exitCode, stdout, stderr } = await execute([
      firstDeployment,
      '--yes',
    ]);
    const deploymentUrl = stdout;

    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

    await waitForDeployment(deploymentUrl);
    await sleep(20000);

    const result = await fetch(url).then(r => r.json());

    expect(result.name).toBe('now-revert-alias-1');
  }

  {
    const { exitCode, stdout, stderr } = await execute([
      secondDeployment,
      '--yes',
    ]);
    const deploymentUrl = stdout;

    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

    await waitForDeployment(deploymentUrl);
    await sleep(20000);
    await fetch(url);
    await sleep(5000);

    const result = await fetch(url).then(r => r.json());

    expect(result.name).toBe('now-revert-alias-2');
  }

  {
    const { exitCode, stdout, stderr } = await execute([
      firstDeployment,
      '--yes',
    ]);
    const deploymentUrl = stdout;

    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

    await waitForDeployment(deploymentUrl);
    await sleep(20000);
    await fetch(url);
    await sleep(5000);

    const result = await fetch(url).then(r => r.json());

    expect(result.name).toBe('now-revert-alias-1');
  }
});

test('whoami', async () => {
  const { exitCode, stdout, stderr } = await execute(['whoami']);

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  expect(stdout).toBe(contextName);
});

test('[vercel dev] fails when dev script calls vercel dev recursively', async () => {
  const deploymentPath = fixture('now-dev-fail-dev-script');
  const { exitCode, stdout, stderr } = await execute(['dev', deploymentPath]);

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(stderr).toContain('must not recursively invoke itself');
});

test('[vercel dev] fails when development command calls vercel dev recursively', async () => {
  expect.assertions(0);

  const dir = fixture('dev-fail-on-recursion-command');
  const dev = execa(binaryPath, ['dev', '--yes', ...defaultArgs], {
    cwd: dir,
    reject: false,
  });

  try {
    await waitForPrompt(dev, chunk =>
      chunk.includes('must not recursively invoke itself')
    );
  } finally {
    const onClose = once(dev, 'close');
    dev.kill();
    await onClose;
  }
});

test('`vercel rm` removes a deployment', async () => {
  const directory = fixture('static-deployment');

  let host;

  {
    const { exitCode, stdout, stderr } = await execa(
      binaryPath,
      [
        directory,
        '--public',
        '--name',
        session,
        ...defaultArgs,
        '-V',
        '2',
        '--force',
        '--yes',
      ],
      {
        reject: false,
      }
    );
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
    host = new URL(stdout).host;
  }

  {
    const { exitCode, stdout, stderr } = await execute(['rm', host, '--yes']);

    expect(stdout).toContain(host);
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }
});

test('`vercel rm` should fail with unexpected option', async () => {
  const output = await execute(['rm', 'example.example.com', '--fake']);

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toMatch(
    /Error: unknown or unexpected option: --fake/gm
  );
});

test('`vercel rm` 404 exits quickly', async () => {
  const start = Date.now();
  const { exitCode, stderr, stdout } = await execute([
    'rm',
    'this.is.a.deployment.that.does.not.exist.example.com',
  ]);

  const delta = Date.now() - start;

  // "does not exist" case is exit code 1, similar to Unix `rm`
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(
    stderr.includes(
      'Could not find any deployments or projects matching "this.is.a.deployment.that.does.not.exist.example.com"'
    )
  ).toBeTruthy();

  // "quickly" meaning < 5 seconds, because it used to hang from a previous bug
  expect(delta < 5000).toBeTruthy();
});

test('render build errors', async () => {
  const deploymentPath = fixture('failing-build');
  const output = await execute([deploymentPath, '--yes']);

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toMatch(/Command "yarn run build" exited with 1/gm);
});

test('invalid deployment, projects and alias names', async () => {
  const check = async (...args: string[]) => {
    const output = await execute(args);
    expect(output.exitCode, formatOutput(output)).toBe(1);
    expect(output.stderr).toMatch(/The provided argument/gm);
  };

  await Promise.all([
    check('alias', '/', 'test'),
    check('alias', 'test', '/'),
    check('rm', '/'),
    check('ls', '/'),
  ]);
});

test('vercel certs ls', async () => {
  const output = await execute(['certs', 'ls']);

  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toMatch(/certificates? found under/gm);
});

test('vercel certs ls --next=123456', async () => {
  const output = await execute(['certs', 'ls', '--next=123456']);

  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toMatch(/No certificates found under/gm);
});

test('vercel hasOwnProperty not a valid subcommand', async () => {
  const output = await execute(['hasOwnProperty']);

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toMatch(
    /The specified file or directory "hasOwnProperty" does not exist/gm
  );
});

test('create zero-config deployment', async () => {
  const fixturePath = fixture('zero-config-next-js');
  const output = await execute([fixturePath, '--force', '--public', '--yes']);

  console.log('isCanary', isCanary);

  expect(output.exitCode, formatOutput(output)).toBe(0);

  const { host } = new URL(output.stdout);
  const response = await apiFetch(`/v10/now/deployments/unkown?url=${host}`);

  const text = await response.text();

  expect(response.status).toBe(200);
  const data = JSON.parse(text) as DeploymentLike;

  expect(data.error).toBe(undefined);

  const validBuilders = data.builds.every(build =>
    isCanary ? build.use.endsWith('@canary') : !build.use.endsWith('@canary')
  );

  const buildList = JSON.stringify(data.builds.map(b => b.use));
  const message = `builders match canary (${isCanary}): ${buildList}`;
  expect(validBuilders, message).toBe(true);
});

test('next unsupported functions config shows warning link', async () => {
  const fixturePath = fixture('zero-config-next-js-functions-warning');
  const output = await execute([fixturePath, '--force', '--public', '--yes']);

  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toMatch(
    /Ignoring function property `runtime`\. When using Next\.js, only `memory` and `maxDuration` can be used\./gm
  );
  expect(output.stderr).toMatch(
    /Learn More: https:\/\/vercel\.link\/functions-property-next/gm
  );
});

test('vercel secret add', async () => {
  context.secretName = `my-secret-${Date.now().toString(36)}`;
  const value = 'https://my-secret-endpoint.com';

  const output = await execute(['secret', 'add', context.secretName, value]);
  expect(output.exitCode, formatOutput(output)).toBe(0);
});

test('vercel secret ls', async () => {
  const output = await execute(['secret', 'ls']);
  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stdout).toMatch(/Secrets found under/gm);
});

test('vercel secret ls --test-warning', async () => {
  const output = await execute(['secret', 'ls', '--test-warning']);

  console.log({
    stderr: output.stderr,

    match1: output.stderr.match(/Test warning message./gm),
    match2: output.stderr.match(/No secrets found under/gm),

    match3: output.stderr.match(/Learn more: https:\/\/vercel.com/gm),
    match4: output.stderr.indexOf('Learn more: https://vercel.com/'),
  });

  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toMatch(/Test warning message./gm);
  expect(output.stderr).toMatch(/Learn more: https:\/\/vercel.com/gm);
  expect(output.stdout).toMatch(/No secrets found under/gm);
});

test('vercel secret rename', async () => {
  if (!context.secretName) {
    throw new Error('Shared state "context.secretName" not set.');
  }

  const nextName = `renamed-secret-${Date.now().toString(36)}`;
  const output = await execute([
    'secret',
    'rename',
    context.secretName,
    nextName,
  ]);
  expect(output.exitCode, formatOutput(output)).toBe(0);

  context.secretName = nextName;
});

test('vercel secret rm', async () => {
  if (!context.secretName) {
    throw new Error('Shared state "context.secretName" not set.');
  }

  const output = await execute(['secret', 'rm', context.secretName, '-y']);
  expect(output.exitCode, formatOutput(output)).toBe(0);
});

test('deploy a Lambda with 128MB of memory', async () => {
  const directory = fixture('lambda-with-128-memory');
  const output = await execute([directory, '--yes']);

  expect(output.exitCode, formatOutput(output)).toBe(0);

  const { host: url } = new URL(output.stdout);
  const response = await fetch('https://' + url + '/api/memory');

  expect(response.status).toBe(200);

  // It won't be exactly 128MB,
  // so we just compare if it is lower than 450MB
  const { memory } = await response.json();
  expect(memory).toBe(128);
});

test('fail to deploy a Lambda with an incorrect value for of memory', async () => {
  const directory = fixture('lambda-with-123-memory');
  const output = await execute([directory, '--yes']);

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toMatch(/Serverless Functions.+memory/gm);
  expect(output.stderr).toMatch(/Learn More/gm);
});

test('deploy a Lambda with 3 seconds of maxDuration', async () => {
  const directory = fixture('lambda-with-3-second-timeout');
  const output = await execute([directory, '--yes']);

  expect(output.exitCode, formatOutput(output)).toBe(0);

  const url = new URL(output.stdout);

  // Should time out
  url.pathname = '/api/wait-for/5';
  const response1 = await fetch(url.href);
  expect(response1.status).toBe(504);

  // Should not time out
  url.pathname = '/api/wait-for/1';
  const response2 = await fetch(url.href);
  expect(response2.status).toBe(200);
});

test('fail to deploy a Lambda with an incorrect value for maxDuration', async () => {
  const directory = fixture('lambda-with-1000-second-timeout');
  const output = await execute([directory, '--yes']);

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toMatch(
    /maxDuration must be between 1 second and 10 seconds/gm
  );
});

test('invalid `--token`', async () => {
  const output = await execute(['--token', 'he\nl,o.']);

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toContain(
    'Error: You defined "--token", but its contents are invalid. Must not contain: "\\n", ",", "."'
  );
});

test('deploy a Lambda with a specific runtime', async () => {
  const directory = fixture('lambda-with-php-runtime');
  const output = await execute([directory, '--public', '--yes']);

  expect(output.exitCode, formatOutput(output)).toBe(0);

  const url = new URL(output.stdout);
  const res = await fetch(`${url}/api/test`);
  const text = await res.text();
  expect(text).toBe('Hello from PHP');
});

test('fail to deploy a Lambda with a specific runtime but without a locked version', async () => {
  const directory = fixture('lambda-with-invalid-runtime');
  const output = await execute([directory, '--yes']);

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toMatch(
    /Function Runtimes must have a valid version/gim
  );
});

test('fail to add a domain without a project', async () => {
  const output = await execute(['domains', 'add', 'my-domain.vercel.app']);
  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toMatch(/expects two arguments/gm);
});
