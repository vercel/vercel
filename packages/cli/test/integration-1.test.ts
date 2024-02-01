import path from 'path';
import { URL, parse as parseUrl } from 'url';
import { exec, execCli } from './helpers/exec';
import fetch, { RequestInit } from 'node-fetch';
import retry from 'async-retry';
import fs from 'fs-extra';
import sleep from '../src/util/sleep';
import {
  disableSSO,
  fetchTokenWithRetry,
} from '../../../test/lib/deployment/now-deploy';
import waitForPrompt from './helpers/wait-for-prompt';
import { listTmpDirs } from './helpers/get-tmp-dir';
import getGlobalDir from './helpers/get-global-dir';
import {
  setupE2EFixture,
  prepareE2EFixtures,
} from './helpers/setup-e2e-fixture';
import formatOutput from './helpers/format-output';
import type http from 'http';
import type { CLIProcess } from './helpers/types';
const TEST_TIMEOUT = 3 * 60 * 1000;
jest.setTimeout(TEST_TIMEOUT);

const binaryPath = path.resolve(__dirname, `../scripts/start.js`);

function fetchTokenInformation(token: string, retries = 3) {
  const url = `https://api.vercel.com/v2/user`;
  const headers = { Authorization: `Bearer ${token}` };

  return retry(
    async () => {
      const res = await fetch(url, { headers });

      if (!res.ok) {
        throw new Error(
          `Failed to fetch "${url}", status: ${
            res.status
          }, id: ${res.headers.get('x-vercel-id')}`
        );
      }

      const data = await res.json();

      return data.user;
    },
    { retries, factor: 1 }
  );
}

async function vcLink(projectPath: string) {
  const { exitCode, stdout, stderr } = await execCli(
    binaryPath,
    ['link', '--yes'],
    {
      cwd: projectPath,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
}

async function getLocalhost(vc: CLIProcess): Promise<RegExpExecArray> {
  let localhost: RegExpExecArray | undefined;
  await waitForPrompt(
    vc,
    chunk => {
      const line = chunk.toString();
      if (line.includes('Ready! Available at')) {
        localhost = /(https?:[^\s]+)/g.exec(line) || undefined;
        return true;
      }
      return false;
    },
    5000
  );

  // This should never happen because waitForPrompt will time out
  // and never return here in this case, but extra checking is fine
  // and it makes typescript happy
  if (!localhost) {
    throw new Error('Localhost not found!');
  }

  return localhost;
}

let token: string | undefined;
let email: string | undefined;
let contextName: string | undefined;

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
  } else if (method === 'GET' && pathname === '/v2/user') {
    res.end(JSON.stringify({ user: { email } }));
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

const apiFetch = (url: string, { headers, ...options }: RequestInit = {}) => {
  return fetch(`https://api.vercel.com${url}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(headers || {}),
    },
    ...options,
  });
};

const createUser = async () => {
  await retry(
    async () => {
      token = await fetchTokenWithRetry();

      await fs.writeJSON(getConfigAuthPath(), { token });

      const user = await fetchTokenInformation(token);

      email = user.email;
      contextName = user.username;
    },
    { retries: 3, factor: 1 }
  );
};

function getConfigAuthPath() {
  return path.join(getGlobalDir(), 'auth.json');
}

beforeAll(async () => {
  try {
    await createUser();

    if (!contextName) {
      throw new Error('Shared state "contextName" not set.');
    }
    await prepareE2EFixtures(contextName, binaryPath);

    if (!email) {
      throw new Error('Shared state "email" not set.');
    }
    await fs.remove(getConfigAuthPath());
    const loginOutput = await execCli(binaryPath, [
      'login',
      email,
      '--api',
      loginApiUrl,
    ]);

    expect(loginOutput.exitCode, formatOutput(loginOutput)).toBe(0);
    expect(loginOutput.stderr).toMatch(/You are now logged in\./gm);

    const auth = await fs.readJSON(getConfigAuthPath());
    expect(auth.token).toBe(token);
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
    await execCli(binaryPath, ['logout']);
  }

  const allTmpDirs = listTmpDirs();
  for (const tmpDir of allTmpDirs) {
    console.log('Removing temp dir: ', tmpDir.name);
    tmpDir.removeCallback();
  }
});

test('[vc build] should build project with corepack and select npm@8.1.0', async () => {
  try {
    process.env.ENABLE_EXPERIMENTAL_COREPACK = '1';
    const directory = await setupE2EFixture('vc-build-corepack-npm');
    const before = await exec(directory, 'npm', ['--version']);
    const output = await execCli(binaryPath, ['build'], { cwd: directory });

    expect(output.exitCode, formatOutput(output)).toBe(0);
    expect(output.stderr).toMatch(/Build Completed/gm);
    const after = await exec(directory, 'npm', ['--version']);
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
  } finally {
    delete process.env.ENABLE_EXPERIMENTAL_COREPACK;
  }
});

test('[vc build] should build project with corepack and select pnpm@7.1.0', async () => {
  try {
    process.env.ENABLE_EXPERIMENTAL_COREPACK = '1';
    const directory = await setupE2EFixture('vc-build-corepack-pnpm');
    const before = await exec(directory, 'pnpm', ['--version']);
    const output = await execCli(binaryPath, ['build'], { cwd: directory });
    expect(output.exitCode, formatOutput(output)).toBe(0);
    expect(output.stderr).toMatch(/Build Completed/gm);
    const after = await exec(directory, 'pnpm', ['--version']);
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
  } finally {
    delete process.env.ENABLE_EXPERIMENTAL_COREPACK;
  }
});

test('[vc build] should build project with corepack and select yarn@2.4.3', async () => {
  try {
    process.env.ENABLE_EXPERIMENTAL_COREPACK = '1';
    const directory = await setupE2EFixture('vc-build-corepack-yarn');
    const before = await exec(directory, 'yarn', ['--version']);
    const output = await execCli(binaryPath, ['build'], { cwd: directory });
    expect(output.exitCode, formatOutput(output)).toBe(0);
    expect(output.stderr).toMatch(/Build Completed/gm);
    const after = await exec(directory, 'yarn', ['--version']);
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
  } finally {
    delete process.env.ENABLE_EXPERIMENTAL_COREPACK;
  }
});

test('[vc dev] should print help from `vc develop --help`', async () => {
  const directory = await setupE2EFixture('static-deployment');
  const { exitCode, stdout, stderr } = await execCli(
    binaryPath,
    ['develop', '--help'],
    {
      cwd: directory,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(2);
  expect(stderr).toMatch(/▲ vercel dev/gm);
});

test('default command should deploy directory', async () => {
  const projectDir = await setupE2EFixture('deploy-default-with-sub-directory');
  const target = 'output';

  await vcLink(path.join(projectDir, target));

  const { exitCode, stdout, stderr } = await execCli(
    binaryPath,
    [
      // omit the default "deploy" command
      target,
    ],
    {
      cwd: projectDir,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  expect(stdout).toMatch(/https:\/\/output-.+\.vercel\.app/);
});

test('default command should warn when deploying with conflicting subdirectory', async () => {
  const projectDir = await setupE2EFixture(
    'deploy-default-with-conflicting-sub-directory'
  );
  const target = 'list'; // command that conflicts with a sub directory

  await vcLink(projectDir);

  const { exitCode, stdout, stderr } = await execCli(
    binaryPath,
    [
      // omit the default "deploy" command
      target,
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
  const projectDir = await setupE2EFixture(
    'deploy-default-with-conflicting-sub-directory'
  );
  const target = 'list'; // command that conflicts with a sub directory

  await vcLink(path.join(projectDir, target));

  const { exitCode, stdout, stderr } = await execCli(
    binaryPath,
    ['list', '--cwd', target],
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
  const projectDir = await setupE2EFixture(
    'deploy-default-with-conflicting-sub-directory'
  );
  const target = 'list'; // command that conflicts with a sub directory

  await vcLink(path.join(projectDir, 'list'));

  const { exitCode, stdout, stderr } = await execCli(
    binaryPath,
    [
      // omit the default "deploy" command
      '--cwd',
      target,
    ],
    {
      cwd: projectDir,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  const url = stdout;
  await disableSSO(url, false);

  const deploymentResult = await fetch(`${url}/README.md`);
  const body = await deploymentResult.text();
  expect(body).toEqual(
    'readme contents for deploy-default-with-conflicting-sub-directory'
  );
});

test('should allow deploying a directory that was built with a target environment of "preview" and `--prebuilt` is used without specifying a target', async () => {
  const projectDir = await setupE2EFixture(
    'deploy-default-with-prebuilt-preview'
  );

  await vcLink(projectDir);

  const { exitCode, stdout, stderr } = await execCli(
    binaryPath,
    [
      // omit the default "deploy" command
      '--prebuilt',
    ],
    {
      cwd: projectDir,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  const url = stdout;
  await disableSSO(url, false);

  const deploymentResult = await fetch(`${url}/README.md`);
  const body = await deploymentResult.text();
  expect(body).toEqual(
    'readme contents for deploy-default-with-prebuilt-preview'
  );
});

test('should allow deploying a directory that was prebuilt, but has no builds.json', async () => {
  const projectDir = await setupE2EFixture('build-output-api-raw');

  await vcLink(projectDir);

  const { exitCode, stdout, stderr } = await execCli(
    binaryPath,
    [
      // omit the default "deploy" command
      '--prebuilt',
    ],
    {
      cwd: projectDir,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  const url = stdout;
  await disableSSO(url, false);

  const deploymentResult = await fetch(`${url}/README.md`);
  const body = await deploymentResult.text();
  expect(body).toEqual('readme contents for build-output-api-raw');
});

test('should deploy and not wait for completion', async () => {
  const projectDir = await setupE2EFixture('static-deployment');

  await vcLink(projectDir);

  const { exitCode, stdout, stderr } = await execCli(
    binaryPath,
    [
      // omit the default "deploy" command
      '--no-wait',
    ],
    {
      cwd: projectDir,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  expect(stderr).toMatch(/Note: Deployment is still processing/);
});

test('[vc link] with vercel.json configuration overrides should create a valid deployment', async () => {
  const directory = await setupE2EFixture(
    'vercel-json-configuration-overrides-link'
  );

  const { exitCode, stdout, stderr } = await execCli(
    binaryPath,
    ['link', '--yes'],
    {
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
  const target = await setupE2EFixture('redirects-v2');

  const { exitCode, stdout, stderr } = await execCli(binaryPath, [
    target,
    '--yes',
  ]);

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  const url = stdout;
  await disableSSO(url, false);
  const res = await fetch(`${url}/foo/bar`, { redirect: 'manual' });
  const location = res.headers.get('location');
  expect(location).toBe('https://example.com/foo/bar');
});

test('deploy using --local-config flag v2', async () => {
  const target = await setupE2EFixture('local-config-v2');
  const configPath = path.join(target, 'vercel-test.json');

  const { exitCode, stdout, stderr } = await execCli(binaryPath, [
    'deploy',
    target,
    '--local-config',
    configPath,
    '--yes',
  ]);

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  const { host } = new URL(stdout);
  expect(host).toMatch(/secondary/gm);
  await disableSSO(host, false);

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
  const target = await setupE2EFixture('local-config-v2');

  const { exitCode, stdout, stderr } = await execCli(binaryPath, [
    'deploy',
    target,
    '--local-config',
    'does-not-exist.json',
    '--yes',
  ]);

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);

  expect(stderr).toMatch(
    /Error: Couldn't find a project configuration file at/
  );
  expect(stderr).toMatch(/does-not-exist\.json/);
});

test('deploy using --local-config flag above target', async () => {
  const root = await setupE2EFixture('local-config-above-target');
  const target = path.join(root, 'dir');

  const { exitCode, stdout, stderr } = await execCli(
    binaryPath,
    ['deploy', target, '--local-config', './now-root.json', '--yes'],
    {
      cwd: root,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  const { host } = new URL(stdout);
  await disableSSO(host, false);

  const testRes = await fetch(`https://${host}/index.html`);
  const testText = await testRes.text();
  expect(testText).toBe('<h1>hello index</h1>');

  const anotherTestRes = await fetch(`https://${host}/another.html`);
  const anotherTestText = await anotherTestRes.text();
  expect(anotherTestText).toBe('<h1>hello another</h1>');

  expect(host).toMatch(/root-level/gm);
});

test('Deploy `api-env` fixture and test `vercel env` command', async () => {
  const target = await setupE2EFixture('api-env');

  async function vcLink() {
    const { exitCode, stdout, stderr } = await execCli(
      binaryPath,
      ['link', '--yes'],
      {
        cwd: target,
      }
    );
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  async function vcEnvLsIsEmpty() {
    const { exitCode, stdout, stderr } = await execCli(
      binaryPath,
      ['env', 'ls'],
      {
        cwd: target,
      }
    );

    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
    expect(stderr).toMatch(/No Environment Variables found in Project/gm);
  }

  async function vcEnvAddWithPrompts() {
    const vc = execCli(binaryPath, ['env', 'add'], {
      cwd: target,
    });

    await waitForPrompt(vc, 'What’s the name of the variable?');
    vc.stdin?.write('MY_NEW_ENV_VAR\n');
    await waitForPrompt(
      vc,
      chunk =>
        chunk.includes('What’s the value of') &&
        chunk.includes('MY_NEW_ENV_VAR')
    );
    vc.stdin?.write('my plaintext value\n');

    await waitForPrompt(
      vc,
      chunk =>
        chunk.includes('which Environments') && chunk.includes('MY_NEW_ENV_VAR')
    );
    vc.stdin?.write('a\n'); // select all

    const { exitCode, stdout, stderr } = await vc;

    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  async function vcEnvAddFromStdin() {
    const vc = execCli(
      binaryPath,
      ['env', 'add', 'MY_STDIN_VAR', 'development'],
      {
        cwd: target,
      }
    );
    vc.stdin?.end('{"expect":"quotes"}');
    const { exitCode, stdout, stderr } = await vc;
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  async function vcEnvAddFromStdinPreview() {
    const vc = execCli(binaryPath, ['env', 'add', 'MY_PREVIEW', 'preview'], {
      cwd: target,
    });
    vc.stdin?.end('preview-no-branch');
    const { exitCode, stdout, stderr } = await vc;
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  async function vcEnvAddFromStdinPreviewWithBranch() {
    const vc = execCli(
      binaryPath,
      ['env', 'add', 'MY_PREVIEW', 'preview', 'staging'],
      {
        cwd: target,
      }
    );
    vc.stdin?.end('preview-with-branch');
    const { exitCode, stdout, stderr } = await vc;
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
    expect(stderr).toMatch(/does not have a connected Git repository/gm);
  }

  async function vcEnvLsIncludesVar() {
    const { exitCode, stderr, stdout } = await execCli(
      binaryPath,
      ['env', 'ls'],
      {
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
    const { exitCode, stdout, stderr } = await execCli(
      binaryPath,
      ['env', 'pull', '-y'],
      {
        cwd: target,
      }
    );

    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
    expect(stderr).toMatch(/Created .env.local file/gm);

    const contents = fs.readFileSync(path.join(target, '.env.local'), 'utf8');
    expect(contents).toMatch(/^# Created by Vercel CLI\n/);
    expect(contents).toMatch(/MY_NEW_ENV_VAR="my plaintext value"/);
    expect(contents).toMatch(/MY_STDIN_VAR="{"expect":"quotes"}"/);
    expect(contents).toMatch(/MY_DECRYPTABLE_SECRET_ENV="decryptable value"/);
    expect(contents).not.toMatch(/MY_PREVIEW/);
  }

  async function vcEnvPullOverwrite() {
    const { exitCode, stdout, stderr } = await execCli(
      binaryPath,
      ['env', 'pull'],
      {
        cwd: target,
      }
    );

    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
    expect(stderr).toMatch(/Overwriting existing .env.local file/gm);
    expect(stderr).toMatch(/Updated .env.local file/gm);
  }

  async function vcEnvPullConfirm() {
    fs.writeFileSync(path.join(target, '.env.local'), 'hahaha');

    const vc = execCli(binaryPath, ['env', 'pull'], {
      cwd: target,
    });

    await waitForPrompt(
      vc,
      'Found existing file ".env.local". Do you want to overwrite?'
    );
    vc.stdin?.end('y\n');

    const { exitCode, stdout, stderr } = await vc;
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  async function vcDeployWithVar() {
    const { exitCode, stdout, stderr } = await execCli(binaryPath, [], {
      cwd: target,
    });
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
    const { host } = new URL(stdout);
    await disableSSO(host, false);

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
    const vc = execCli(binaryPath, ['dev', '--debug'], {
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
    const vc = execCli(binaryPath, ['dev'], {
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
    const { exitCode, stdout, stderr } = await execCli(
      binaryPath,
      ['env', 'pull', '-y'],
      {
        cwd: target,
      }
    );

    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

    const contents = fs.readFileSync(path.join(target, '.env.local'), 'utf8');

    const lines = new Set(contents.split('\n'));

    expect(lines).toContain('VERCEL="1"');
    expect(lines).toContain('VERCEL_URL=""');
    expect(lines).toContain('VERCEL_ENV="development"');
    expect(lines).toContain('VERCEL_GIT_PROVIDER=""');
    expect(lines).toContain('VERCEL_GIT_REPO_SLUG=""');
  }

  async function vcDevAndFetchSystemVars() {
    const vc = execCli(binaryPath, ['dev'], {
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
    const vc = execCli(binaryPath, ['env', 'rm', '-y'], {
      cwd: target,
    });
    await waitForPrompt(vc, 'What’s the name of the variable?');
    vc.stdin?.write('MY_PREVIEW\n');
    const { exitCode, stdout, stderr } = await vc;
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  async function vcEnvRemoveWithArgs() {
    const { exitCode, stdout, stderr } = await execCli(
      binaryPath,
      ['env', 'rm', 'MY_STDIN_VAR', 'development', '-y'],
      {
        cwd: target,
      }
    );

    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

    const { exitCode: exitCode3 } = await execCli(
      binaryPath,
      ['env', 'rm', 'MY_DECRYPTABLE_SECRET_ENV', 'development', '-y'],
      {
        cwd: target,
      }
    );

    expect(exitCode3).toBe(0);
  }

  async function vcEnvRemoveWithNameOnly() {
    const { exitCode, stdout, stderr } = await execCli(
      binaryPath,
      ['env', 'rm', 'MY_NEW_ENV_VAR', '-y'],
      {
        cwd: target,
      }
    );

    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  function vcEnvRemoveByName(name: string) {
    return execCli(binaryPath, ['env', 'rm', name, '-y'], {
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
    fs.unlinkSync(path.join(target, '.env.local'));
    await vcDevAndFetchCloudVars();
    await enableAutoExposeSystemEnvs();
    await vcEnvPullFetchSystemVars();
    fs.unlinkSync(path.join(target, '.env.local'));
    await vcDevAndFetchSystemVars();
    await vcEnvRemove();
    await vcEnvRemoveWithArgs();
    await vcEnvRemoveWithNameOnly();
    await vcEnvLsIsEmpty();
  } finally {
    await vcEnvRemoveAll();
  }
});
