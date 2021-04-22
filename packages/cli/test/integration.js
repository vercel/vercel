import ms from 'ms';
import path from 'path';
import { URL, parse as parseUrl } from 'url';
import test from 'ava';
import semVer from 'semver';
import { Readable } from 'stream';
import { homedir } from 'os';
import _execa from 'execa';
import XDGAppPaths from 'xdg-app-paths';
import fetch from 'node-fetch';
import tmp from 'tmp-promise';
import retry from 'async-retry';
import fs, {
  writeFile,
  readFile,
  remove,
  copy,
  ensureDir,
  exists,
} from 'fs-extra';
import logo from '../src/util/output/logo';
import sleep from '../src/util/sleep';
import pkg from '../package';
import prepareFixtures from './helpers/prepare';
import { fetchTokenWithRetry } from '../../../test/lib/deployment/now-deploy';

// log command when running `execa`
function execa(file, args, options) {
  console.log(`$ vercel ${args.join(' ')}`);
  return _execa(file, args, options);
}

function fixture(name) {
  const directory = path.join(__dirname, 'fixtures', 'integration', name);
  const config = path.join(directory, 'project.json');

  // We need to remove it, otherwise we can't re-use fixtures
  if (fs.existsSync(config)) {
    fs.unlinkSync(config);
  }

  return directory;
}

const binaryPath = path.resolve(__dirname, `../scripts/start.js`);
const example = name =>
  path.join(__dirname, '..', '..', '..', 'examples', name);
const deployHelpMessage = `${logo} vercel [options] <command | path>`;
let session = 'temp-session';

const isCanary = pkg.version.includes('canary');

const pickUrl = stdout => {
  const lines = stdout.split('\n');
  return lines[lines.length - 1];
};

const createFile = dest => fs.closeSync(fs.openSync(dest, 'w'));

const waitForDeployment = async href => {
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

function fetchTokenInformation(token, retries = 3) {
  const url = `https://api.vercel.com/www/user`;
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

function formatOutput({ stderr, stdout }) {
  return `
-----

Stderr:
${stderr}

-----

Stdout:
${stdout}

-----
  `;
}

// AVA's `t.context` can only be set before the tests,
// but we want to set it within as well
const context = {};

const defaultOptions = { reject: false };
const defaultArgs = [];
let token;
let email;
let contextName;

let tmpDir;

let globalDir = XDGAppPaths('com.vercel.cli').dataDirs()[0];

if (!process.env.CI) {
  tmpDir = tmp.dirSync({
    // This ensures the directory gets
    // deleted even if it has contents
    unsafeCleanup: true,
  });

  globalDir = path.join(tmpDir.name, 'com.vercel.tests');

  defaultArgs.push('-Q', globalDir);
  console.log(
    'No CI detected, adding defaultArgs to avoid polluting user settings',
    defaultArgs
  );
}

function mockLoginApi(req, res) {
  const { url = '/', method } = req;
  let { pathname = '/', query = {} } = parseUrl(url, true);
  console.log(`[mock-login-server] ${method} ${pathname}`);
  const securityCode = 'Bears Beets Battlestar Galactica';
  if (
    method === 'POST' &&
    pathname === '/now/registration' &&
    query.mode === 'login'
  ) {
    res.end(JSON.stringify({ token, securityCode }));
  } else if (
    method === 'GET' &&
    pathname === '/now/registration/verify' &&
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

const execute = (args, options) =>
  execa(binaryPath, [...defaultArgs, ...args], {
    ...defaultOptions,
    ...options,
  });

const apiFetch = (url, { headers, ...options } = {}) => {
  return fetch(`https://api.vercel.com${url}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(headers || {}),
    },
    ...options,
  });
};

const waitForPrompt = (cp, assertion) =>
  new Promise((resolve, reject) => {
    console.log('Waiting for prompt...');
    setTimeout(() => reject(new Error('timeout in waitForPrompt')), 60000);
    const listener = chunk => {
      console.log('> ' + chunk);
      if (assertion(chunk)) {
        cp.stdout.off && cp.stdout.off('data', listener);
        cp.stderr.off && cp.stderr.off('data', listener);
        resolve();
      }
    };

    cp.stdout.on('data', listener);
    cp.stderr.on('data', listener);
  });

const getDeploymentBuildsByUrl = async url => {
  const hostRes = await apiFetch(`/v10/now/deployments/get?url=${url}`);
  const { id } = await hostRes.json();
  const buildsRes = await apiFetch(`/v10/now/deployments/${id}/builds`);
  const { builds } = await buildsRes.json();
  return builds;
};

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

test.before(async () => {
  try {
    await createUser();
    await prepareFixtures(contextName);
  } catch (err) {
    console.log('Failed `test.before`');
    console.log(err);
  }
});

test.after.always(async () => {
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
});

test('default command should prompt login with empty auth.json', async t => {
  await fs.writeFile(getConfigAuthPath(), JSON.stringify({}));
  try {
    await execa(binaryPath, [...defaultArgs]);
    t.fail();
  } catch (err) {
    t.true(
      err.stderr.includes(
        'Error! No existing credentials found. Please run `vercel login` or pass "--token"'
      )
    );
  }
});

test('login', async t => {
  t.timeout(ms('1m'));

  await fs.remove(getConfigAuthPath());
  const loginOutput = await execa(binaryPath, [
    'login',
    email,
    '--api',
    loginApiUrl,
    ...defaultArgs,
  ]);

  t.is(loginOutput.exitCode, 0, formatOutput(loginOutput));
  t.regex(
    loginOutput.stdout,
    /You are now logged in\./gm,
    formatOutput(loginOutput)
  );

  const auth = await fs.readJSON(getConfigAuthPath());
  t.is(auth.token, token);
});

test('deploy using only now.json with `redirects` defined', async t => {
  const target = fixture('redirects-v2');

  const { exitCode, stderr, stdout } = await execa(
    binaryPath,
    [target, ...defaultArgs, '--confirm'],
    {
      reject: false,
    }
  );

  t.is(exitCode, 0, formatOutput({ stderr, stdout }));

  const url = stdout;
  const res = await fetch(`${url}/foo/bar`, { redirect: 'manual' });
  const location = res.headers.get('location');
  t.is(location, 'https://example.com/foo/bar');
});

test('deploy using --local-config flag v2', async t => {
  const target = fixture('local-config-v2');
  const configPath = path.join(target, 'now-test.json');

  const { exitCode, stderr, stdout } = await execa(
    binaryPath,
    [
      'deploy',
      target,
      '--local-config',
      configPath,
      ...defaultArgs,
      '--confirm',
    ],
    {
      reject: false,
    }
  );

  t.is(exitCode, 0, formatOutput({ stderr, stdout }));

  const { host } = new URL(stdout);
  t.regex(host, /secondary/gm, `Expected "secondary" but received "${host}"`);

  const testRes = await fetch(`https://${host}/test-${contextName}.html`);
  const testText = await testRes.text();
  t.is(testText, '<h1>hello test</h1>');

  const anotherTestRes = await fetch(`https://${host}/another-test`);
  const anotherTestText = await anotherTestRes.text();
  t.is(anotherTestText, testText);

  const mainRes = await fetch(`https://${host}/main-${contextName}.html`);
  t.is(mainRes.status, 404, 'Should not deploy/build main now.json');

  const anotherMainRes = await fetch(`https://${host}/another-main`);
  t.is(anotherMainRes.status, 404, 'Should not deploy/build main now.json');
});

test('deploy using --local-config flag above target', async t => {
  const root = fixture('local-config-above-target');
  const target = path.join(root, 'dir');

  const { exitCode, stderr, stdout } = await execa(
    binaryPath,
    [
      'deploy',
      target,
      '--local-config',
      './now-root.json',
      ...defaultArgs,
      '--confirm',
    ],
    {
      cwd: root,
      reject: false,
    }
  );

  t.is(exitCode, 0, formatOutput({ stderr, stdout }));

  const { host } = new URL(stdout);

  const testRes = await fetch(`https://${host}/index.html`);
  const testText = await testRes.text();
  t.is(testText, '<h1>hello index</h1>');

  const anotherTestRes = await fetch(`https://${host}/another.html`);
  const anotherTestText = await anotherTestRes.text();
  t.is(anotherTestText, '<h1>hello another</h1>');

  t.regex(host, /root-level/gm, `Expected "root-level" but received "${host}"`);
});

test('Deploy `api-env` fixture and test `vercel env` command', async t => {
  const target = fixture('api-env');

  async function vcLink() {
    const { exitCode, stderr, stdout } = await execa(
      binaryPath,
      ['link', '--confirm', ...defaultArgs],
      {
        reject: false,
        cwd: target,
      }
    );
    console.log({ stdout });
    t.is(exitCode, 0, formatOutput({ stderr, stdout }));
  }

  async function vcEnvLsIsEmpty() {
    const { exitCode, stderr, stdout } = await execa(
      binaryPath,
      ['env', 'ls', ...defaultArgs],
      {
        reject: false,
        cwd: target,
      }
    );

    t.is(exitCode, 0, formatOutput({ stderr, stdout }));
    t.regex(stderr, /No Environment Variables found in Project/gm);
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

    const { exitCode, stderr, stdout } = await vc;

    t.is(exitCode, 0, formatOutput({ stderr, stdout }));
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
    const { exitCode, stderr, stdout } = await vc;
    t.is(exitCode, 0, formatOutput({ stderr, stdout }));
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
    const { exitCode, stderr, stdout } = await vc;
    t.is(exitCode, 0, formatOutput({ stderr, stdout }));
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
    const { exitCode, stderr, stdout } = await vc;
    t.is(exitCode, 1, formatOutput({ stderr, stdout }));
    t.regex(stderr, /does not have a connected Git repository/gm);
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

    t.is(exitCode, 0, formatOutput({ stderr, stdout }));
    t.regex(stderr, /Environment Variables found in Project/gm);

    console.log(stdout);

    const lines = stdout.split('\n');

    const plaintextEnvs = lines.filter(line => line.includes('MY_NEW_ENV_VAR'));
    t.is(plaintextEnvs.length, 1);
    t.regex(plaintextEnvs[0], /Production, Preview, Development/gm);

    const stdinEnvs = lines.filter(line => line.includes('MY_STDIN_VAR'));
    t.is(stdinEnvs.length, 1);
    t.regex(stdinEnvs[0], /Development/gm);

    const previewEnvs = lines.filter(line => line.includes('MY_PREVIEW'));
    t.is(previewEnvs.length, 1);
    t.regex(previewEnvs[0], /Encrypted .* Preview /gm);
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

    t.is(res.status, 200);

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

    t.is(resEnv.status, 200);
  }

  async function vcEnvPull() {
    const { exitCode, stderr, stdout } = await execa(
      binaryPath,
      ['env', 'pull', '-y', ...defaultArgs],
      {
        reject: false,
        cwd: target,
      }
    );

    t.is(exitCode, 0, formatOutput({ stderr, stdout }));
    t.regex(stderr, /Created .env file/gm);

    const contents = fs.readFileSync(path.join(target, '.env'), 'utf8');
    t.true(contents.startsWith('# Created by Vercel CLI\n'));

    const lines = new Set(contents.split('\n'));
    t.true(lines.has('MY_NEW_ENV_VAR="my plaintext value"'));
    t.true(lines.has('MY_STDIN_VAR="{"expect":"quotes"}"'));
    t.true(lines.has('MY_DECRYPTABLE_SECRET_ENV="decryptable value"'));
    t.false(lines.has('MY_PREVIEW'));
  }

  async function vcEnvPullOverwrite() {
    const { exitCode, stderr, stdout } = await execa(
      binaryPath,
      ['env', 'pull', ...defaultArgs],
      {
        reject: false,
        cwd: target,
      }
    );

    t.is(exitCode, 0, formatOutput({ stderr, stdout }));
    t.regex(stderr, /Overwriting existing .env file/gm);
    t.regex(stderr, /Updated .env file/gm);
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

    const { exitCode, stderr, stdout } = await vc;
    t.is(exitCode, 0, formatOutput({ stderr, stdout }));
  }

  async function vcDeployWithVar() {
    const { exitCode, stderr, stdout } = await execa(
      binaryPath,
      [...defaultArgs],
      {
        reject: false,
        cwd: target,
      }
    );
    t.is(exitCode, 0, formatOutput({ stderr, stdout }));
    const { host } = new URL(stdout);

    const apiUrl = `https://${host}/api/get-env`;
    console.log({ apiUrl });
    const apiRes = await fetch(apiUrl);
    t.is(apiRes.status, 200, formatOutput({ stderr, stdout }));
    const apiJson = await apiRes.json();
    t.is(apiJson['MY_NEW_ENV_VAR'], 'my plaintext value');

    const homeUrl = `https://${host}`;
    console.log({ homeUrl });
    const homeRes = await fetch(homeUrl);
    t.is(homeRes.status, 200, formatOutput({ stderr, stdout }));
    const homeJson = await homeRes.json();
    t.is(homeJson['MY_NEW_ENV_VAR'], 'my plaintext value');
  }

  async function vcDevWithEnv() {
    const vc = execa(binaryPath, ['dev', ...defaultArgs], {
      reject: false,
      cwd: target,
    });

    let localhost = undefined;
    await waitForPrompt(vc, chunk => {
      if (chunk.includes('Ready! Available at')) {
        localhost = /(https?:[^\s]+)/g.exec(chunk);
        return true;
      }
      return false;
    });

    const apiUrl = `${localhost[0]}/api/get-env`;
    const apiRes = await fetch(apiUrl);

    t.is(apiRes.status, 200);

    const apiJson = await apiRes.json();

    t.is(apiJson['MY_NEW_ENV_VAR'], 'my plaintext value');
    t.is(apiJson['MY_DECRYPTABLE_SECRET_ENV'], 'decryptable value');

    const homeUrl = localhost[0];

    const homeRes = await fetch(homeUrl);
    const homeJson = await homeRes.json();
    t.is(homeJson['MY_NEW_ENV_VAR'], 'my plaintext value');
    t.is(homeJson['MY_DECRYPTABLE_SECRET_ENV'], 'decryptable value');

    vc.kill('SIGTERM', { forceKillAfterTimeout: 2000 });

    const { exitCode, stderr, stdout } = await vc;
    t.is(exitCode, 0, formatOutput({ stderr, stdout }));
  }

  async function vcDevAndFetchCloudVars() {
    const vc = execa(binaryPath, ['dev', ...defaultArgs], {
      reject: false,
      cwd: target,
    });

    let localhost = undefined;
    await waitForPrompt(vc, chunk => {
      if (chunk.includes('Ready! Available at')) {
        localhost = /(https?:[^\s]+)/g.exec(chunk);
        return true;
      }
      return false;
    });

    const apiUrl = `${localhost[0]}/api/get-env`;
    const apiRes = await fetch(apiUrl);
    t.is(apiRes.status, 200);

    const apiJson = await apiRes.json();
    t.is(apiJson['MY_NEW_ENV_VAR'], 'my plaintext value');
    t.is(apiJson['MY_STDIN_VAR'], '{"expect":"quotes"}');
    t.is(apiJson['MY_DECRYPTABLE_SECRET_ENV'], 'decryptable value');

    const homeUrl = localhost[0];
    const homeRes = await fetch(homeUrl);
    const homeJson = await homeRes.json();
    t.is(homeJson['MY_NEW_ENV_VAR'], 'my plaintext value');
    t.is(homeJson['MY_STDIN_VAR'], '{"expect":"quotes"}');
    t.is(homeJson['MY_DECRYPTABLE_SECRET_ENV'], 'decryptable value');

    // system env vars are automatically exposed
    t.is(apiJson['VERCEL'], '1');
    t.is(homeJson['VERCEL'], '1');

    vc.kill('SIGTERM', { forceKillAfterTimeout: 2000 });

    const { exitCode, stderr, stdout } = await vc;
    t.is(exitCode, 0, formatOutput({ stderr, stdout }));
  }

  async function enableAutoExposeSystemEnvs() {
    const link = require(path.join(target, '.vercel/project.json'));

    const res = await apiFetch(`/v2/projects/${link.projectId}`, {
      method: 'PATCH',
      body: JSON.stringify({ autoExposeSystemEnvs: true }),
    });

    t.is(res.status, 200);
    if (res.status === 200) {
      console.log(
        `Set autoExposeSystemEnvs=true for project ${link.projectId}`
      );
    }
  }

  async function vcEnvPullFetchSystemVars() {
    const { exitCode, stderr, stdout } = await execa(
      binaryPath,
      ['env', 'pull', '-y', ...defaultArgs],
      {
        reject: false,
        cwd: target,
      }
    );

    t.is(exitCode, 0, formatOutput({ stderr, stdout }));

    const contents = fs.readFileSync(path.join(target, '.env'), 'utf8');

    const lines = new Set(contents.split('\n'));
    t.true(lines.has('VERCEL="1"'));
    t.true(lines.has('VERCEL_URL=""'));
    t.true(lines.has('VERCEL_ENV="development"'));
    t.true(lines.has('VERCEL_GIT_PROVIDER=""'));
    t.true(lines.has('VERCEL_GIT_REPO_SLUG=""'));
  }

  async function vcDevAndFetchSystemVars() {
    const vc = execa(binaryPath, ['dev', ...defaultArgs], {
      reject: false,
      cwd: target,
    });

    let localhost = undefined;
    await waitForPrompt(vc, chunk => {
      if (chunk.includes('Ready! Available at')) {
        localhost = /(https?:[^\s]+)/g.exec(chunk);
        return true;
      }
      return false;
    });

    const apiUrl = `${localhost[0]}/api/get-env`;
    const apiRes = await fetch(apiUrl);

    const localhostNoProtocol = localhost[0].slice('http://'.length);

    const apiJson = await apiRes.json();
    t.is(apiJson['VERCEL'], '1');
    t.is(apiJson['VERCEL_URL'], localhostNoProtocol);
    t.is(apiJson['VERCEL_ENV'], 'development');
    t.is(apiJson['VERCEL_REGION'], 'dev1');
    t.is(apiJson['VERCEL_GIT_PROVIDER'], '');
    t.is(apiJson['VERCEL_GIT_REPO_SLUG'], '');

    const homeUrl = localhost[0];
    const homeRes = await fetch(homeUrl);
    const homeJson = await homeRes.json();
    t.is(homeJson['VERCEL'], '1');
    t.is(homeJson['VERCEL_URL'], localhostNoProtocol);
    t.is(homeJson['VERCEL_ENV'], 'development');
    t.is(homeJson['VERCEL_REGION'], undefined);
    t.is(homeJson['VERCEL_GIT_PROVIDER'], '');
    t.is(homeJson['VERCEL_GIT_REPO_SLUG'], '');

    vc.kill('SIGTERM', { forceKillAfterTimeout: 2000 });

    const { exitCode, stderr, stdout } = await vc;
    t.is(exitCode, 0, formatOutput({ stderr, stdout }));
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
    const { exitCode, stderr, stdout } = await vc;
    t.is(exitCode, 0, formatOutput({ stderr, stdout }));
  }

  async function vcEnvRemoveWithArgs() {
    const { exitCode, stderr, stdout } = await execa(
      binaryPath,
      ['env', 'rm', 'MY_STDIN_VAR', 'development', '-y', ...defaultArgs],
      {
        reject: false,
        cwd: target,
      }
    );

    t.is(exitCode, 0, formatOutput({ stderr, stdout }));

    const {
      exitCode: exitCode3,
      stderr: stderr3,
      stdout: stdout3,
    } = await execa(
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

    t.is(exitCode3, 0, formatOutput({ stderr3, stdout3 }));
  }

  async function vcEnvRemoveWithNameOnly() {
    const { exitCode, stderr, stdout } = await execa(
      binaryPath,
      ['env', 'rm', 'MY_NEW_ENV_VAR', '-y', ...defaultArgs],
      {
        reject: false,
        cwd: target,
      }
    );

    t.is(exitCode, 0, formatOutput({ stderr, stdout }));
  }

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
});

test('[vc projects] should create a project successfully', async t => {
  const projectName = `vc-projects-add-${
    Math.random().toString(36).split('.')[1]
  }`;

  const vc = execa(binaryPath, [
    'projects',
    'add',
    projectName,
    ...defaultArgs,
  ]);

  await waitForPrompt(vc, chunk =>
    chunk.includes(`Success! Project ${projectName} added`)
  );

  const { exitCode, stderr, stdout } = await vc;
  t.is(exitCode, 0, formatOutput({ stderr, stdout }));

  // creating the same project again should succeed
  const vc2 = execa(binaryPath, [
    'projects',
    'add',
    projectName,
    ...defaultArgs,
  ]);

  await waitForPrompt(vc2, chunk =>
    chunk.includes(`Success! Project ${projectName} added`)
  );

  const { exitCode: exitCode2, stderr: stderr2, stdout: stdout2 } = await vc;
  t.is(exitCode2, 0, formatOutput({ stderr2, stdout2 }));
});

test('deploy with metadata containing "=" in the value', async t => {
  const target = fixture('static-v2-meta');

  const { exitCode, stderr, stdout } = await execa(
    binaryPath,
    [target, ...defaultArgs, '--confirm', '--meta', 'someKey=='],
    { reject: false }
  );

  t.is(exitCode, 0, formatOutput({ stderr, stdout }));

  const { host } = new URL(stdout);
  const res = await fetch(
    `https://api.vercel.com/v12/now/deployments/get?url=${host}`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  const deployment = await res.json();
  t.is(deployment.meta.someKey, '=');
});

test('print the deploy help message', async t => {
  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    ['help', ...defaultArgs],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 2);
  t.true(stderr.includes(deployHelpMessage), `Received:\n${stderr}\n${stdout}`);
  t.false(
    stderr.includes('ExperimentalWarning'),
    `Received:\n${stderr}\n${stdout}`
  );
});

test('output the version', async t => {
  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    ['--version', ...defaultArgs],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  const version = stdout.trim();

  t.is(exitCode, 0);
  t.truthy(semVer.valid(version));
  t.is(version, pkg.version);
});

test('should error with suggestion for secrets subcommand', async t => {
  const target = fixture('subdirectory-secret');

  const { exitCode, stderr, stdout } = await execa(
    binaryPath,
    ['secret', 'add', 'key', 'value', ...defaultArgs],
    {
      cwd: target,
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 1);
  t.regex(
    stderr,
    /secrets/gm,
    `Expected "secrets" suggestion but received "${stderr}"`
  );
});

test('should add secret with hyphen prefix', async t => {
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

  t.is(
    secretCall.exitCode,
    0,
    formatOutput({ stderr: secretCall.stderr, stdout: secretCall.stdout })
  );

  let targetCall = await execa(binaryPath, [...defaultArgs, '--confirm'], {
    cwd: target,
    reject: false,
  });

  t.is(
    targetCall.exitCode,
    0,
    formatOutput({ stderr: targetCall.stderr, stdout: targetCall.stdout })
  );
  const { host } = new URL(targetCall.stdout);
  const response = await fetch(`https://${host}`);
  t.is(
    response.status,
    200,
    formatOutput({ stderr: targetCall.stderr, stdout: targetCall.stdout })
  );
  t.is(
    await response.text(),
    `${value}\n`,
    formatOutput({ stderr: targetCall.stderr, stdout: targetCall.stdout })
  );
});

test('login with unregistered user', async t => {
  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    ['login', `${session}@${session}.com`, ...defaultArgs],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  const goal = `Error! Please sign up: https://vercel.com/signup`;
  const lines = stderr.trim().split('\n');
  const last = lines[lines.length - 1];

  t.is(exitCode, 1);
  t.true(last.includes(goal));
});

test('ignore files specified in .nowignore', async t => {
  const directory = fixture('nowignore');

  const args = [
    '--debug',
    '--public',
    '--name',
    session,
    ...defaultArgs,
    '--confirm',
  ];
  const targetCall = await execa(binaryPath, args, {
    cwd: directory,
    reject: false,
  });

  console.log(targetCall.stderr);
  console.log(targetCall.stdout);
  console.log(targetCall.exitCode);

  const { host } = new URL(targetCall.stdout);
  const ignoredFile = await fetch(`https://${host}/ignored.txt`);
  t.is(ignoredFile.status, 404);

  const presentFile = await fetch(`https://${host}/index.txt`);
  t.is(presentFile.status, 200);
});

test('ignore files specified in .nowignore via allowlist', async t => {
  const directory = fixture('nowignore-allowlist');

  const args = [
    '--debug',
    '--public',
    '--name',
    session,
    ...defaultArgs,
    '--confirm',
  ];
  const targetCall = await execa(binaryPath, args, {
    cwd: directory,
    reject: false,
  });

  console.log(targetCall.stderr);
  console.log(targetCall.stdout);
  console.log(targetCall.exitCode);

  const { host } = new URL(targetCall.stdout);
  const ignoredFile = await fetch(`https://${host}/ignored.txt`);
  t.is(ignoredFile.status, 404);

  const presentFile = await fetch(`https://${host}/index.txt`);
  t.is(presentFile.status, 200);
});

test('list the scopes', async t => {
  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    ['teams', 'ls', ...defaultArgs],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 0);

  const include = new RegExp(`✔ ${contextName}\\s+${email}`);

  t.true(
    include.test(stdout),
    `Expected: ${include}\n\nReceived instead:\n${stdout}\n${stderr}`
  );
});

test('list the payment methods', async t => {
  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    ['billing', 'ls', ...defaultArgs],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 0);
  t.true(stdout.startsWith(`> 0 cards found under ${contextName}`));
});

test('domains inspect', async t => {
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
    '--confirm',
    '--public',
  ]);
  t.is(output.exitCode, 0, formatOutput(output));

  {
    // Add a domain that can be inspected
    const result = await execa(
      binaryPath,
      [`domains`, `add`, domainName, projectName, ...defaultArgs],
      { reject: false }
    );

    t.is(result.exitCode, 0, formatOutput(result));
  }

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    ['domains', 'inspect', domainName, ...defaultArgs],
    {
      reject: false,
    }
  );

  t.true(stderr.includes(`Renewal Price`));
  t.is(exitCode, 0, formatOutput({ stdout, stderr }));

  {
    // Remove the domain again
    const result = await execa(
      binaryPath,
      [`domains`, `rm`, domainName, ...defaultArgs],
      { reject: false, input: 'y' }
    );

    t.is(result.exitCode, 0, formatOutput(result));
  }
});

test('try to purchase a domain', async t => {
  if (process.env.VERCEL_TOKEN || process.env.NOW_TOKEN) {
    console.log(
      'Skipping test `try to purchase a domain` because a personal VERCEL_TOKEN was provided.'
    );
    t.pass();
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
    ['domains', 'buy', `${session}-test.org`, ...defaultArgs],
    {
      reject: false,
      input: stream,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 1);
  t.true(
    stderr.includes(
      `Error! Could not purchase domain. Please add a payment method using \`vercel billing add\`.`
    )
  );
});

test('try to transfer-in a domain with "--code" option', async t => {
  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [
      'domains',
      'transfer-in',
      '--code',
      'xyz',
      `${session}-test.org`,
      ...defaultArgs,
    ],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.true(
    stderr.includes(
      `Error! The domain "${session}-test.org" is not transferable.`
    )
  );
  t.is(exitCode, 1);
});

test('try to move an invalid domain', async t => {
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

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.true(stderr.includes(`Error! Domain not found under `));
  t.is(exitCode, 1);
});

test('try to set default without existing payment method', async t => {
  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    ['billing', 'set-default', ...defaultArgs],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 0);
  t.true(stderr.includes('You have no credit cards to choose from'));
});

test('try to remove a non-existing payment method', async t => {
  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    ['billing', 'rm', 'card_d2j32d9382jr928rd', ...defaultArgs],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 0);
  t.true(
    stderr.includes(
      `You have no credit cards to choose from to delete under ${contextName}`
    )
  );
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

test('ensure username in list is right', async t => {
  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    ['ls', ...defaultArgs],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  // Ensure the exit code is right
  t.is(exitCode, 0);

  const line = stdout
    .split('\n')
    .find(line => line.includes('.now.sh') || line.includes('.vercel.app'));
  const columns = line.split(/\s+/);

  // Ensure username column have username
  t.truthy(columns.pop().includes(contextName));
});

test('ensure we render a warning for deployments with no files', async t => {
  const directory = fixture('empty-directory');

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [
      directory,
      '--public',
      '--name',
      session,
      ...defaultArgs,
      '--confirm',
      '--force',
    ],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  // Ensure the warning is printed
  t.regex(stderr, /There are no files inside your deployment/);

  // Test if the output is really a URL
  const { href, host } = new URL(stdout);
  t.is(host.split('-')[0], session);

  if (host) {
    context.deployment = host;
  }

  // Ensure the exit code is right
  t.is(exitCode, 0);

  // Send a test request to the deployment
  const res = await fetch(href);
  t.is(res.status, 404);
});

test('output logs with "short" output', async t => {
  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    ['logs', context.deployment, ...defaultArgs],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.true(
    stderr.includes(`Fetched deployment "${context.deployment}"`),
    formatOutput({ stderr, stdout })
  );

  // "short" format includes timestamps
  t.truthy(
    stdout.match(
      /\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z)/
    ),
    formatOutput({ stderr, stdout })
  );

  t.is(exitCode, 0);
});

test('output logs with "raw" output', async t => {
  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    ['logs', context.deployment, ...defaultArgs, '--output', 'raw'],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.true(
    stderr.includes(`Fetched deployment "${context.deployment}"`),
    formatOutput({ stderr, stdout })
  );

  // "raw" format does not include timestamps
  t.is(
    null,
    stdout.match(
      /\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z)/
    )
  );

  t.is(exitCode, 0);
});

test('ensure we render a prompt when deploying home directory', async t => {
  const directory = homedir();

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [directory, '--public', '--name', session, ...defaultArgs, '--force'],
    {
      reject: false,
      input: 'N',
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  // Ensure the exit code is right
  t.is(exitCode, 0);

  t.true(
    stdout.includes(
      'You are deploying your home directory. Do you want to continue? [y/N]'
    )
  );
  t.true(stderr.includes('Aborted'));
});

test('ensure the `scope` property works with email', async t => {
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
      '--confirm',
    ],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  // Ensure we're deploying under the right scope
  t.true(stderr.includes(session));

  // Ensure the exit code is right
  t.is(exitCode, 0);

  // Test if the output is really a URL
  const { href, host } = new URL(stdout);
  t.is(host.split('-')[0], session);

  // Send a test request to the deployment
  const response = await fetch(href);
  const contentType = response.headers.get('content-type');

  t.is(contentType, 'text/html; charset=utf-8');
});

test('ensure the `scope` property works with username', async t => {
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
      '--confirm',
    ],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  // Ensure we're deploying under the right scope
  t.true(stderr.includes(contextName));

  // Ensure the exit code is right
  t.is(exitCode, 0);

  // Test if the output is really a URL
  const { href, host } = new URL(stdout);
  t.is(host.split('-')[0], session);

  // Send a test request to the deployment
  const response = await fetch(href);
  const contentType = response.headers.get('content-type');

  t.is(contentType, 'text/html; charset=utf-8');
});

test('try to create a builds deployments with wrong now.json', async t => {
  const directory = fixture('builds-wrong');

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [directory, '--public', ...defaultArgs, '--confirm'],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  // Ensure the exit code is right
  t.is(exitCode, 1);
  t.true(
    stderr.includes(
      'Error! Invalid now.json - should NOT have additional property `builder`. Did you mean `builds`?'
    )
  );
  t.true(stderr.includes('https://vercel.com/docs/configuration'));
});

test('try to create a builds deployments with wrong vercel.json', async t => {
  const directory = fixture('builds-wrong-vercel');

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [directory, '--public', ...defaultArgs, '--confirm'],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 1);
  t.true(
    stderr.includes(
      'Error! Invalid vercel.json - should NOT have additional property `fake`. Please remove it.'
    )
  );
  t.true(stderr.includes('https://vercel.com/docs/configuration'));
});

test('try to create a builds deployments with wrong `build.env` property', async t => {
  const directory = fixture('builds-wrong-build-env');

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    ['--public', ...defaultArgs, '--confirm'],
    {
      cwd: directory,
      reject: false,
    }
  );

  t.is(exitCode, 1, formatOutput({ stdout, stderr }));
  t.true(
    stderr.includes(
      'Error! Invalid vercel.json - should NOT have additional property `build.env`. Did you mean `{ "build": { "env": {"name": "value"} } }`?'
    ),
    formatOutput({ stdout, stderr })
  );
  t.true(
    stderr.includes('https://vercel.com/docs/configuration'),
    formatOutput({ stdout, stderr })
  );
});

test('create a builds deployments with no actual builds', async t => {
  const directory = fixture('builds-no-list');

  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    [
      directory,
      '--public',
      '--name',
      session,
      ...defaultArgs,
      '--force',
      '--confirm',
    ],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  // Ensure the exit code is right
  t.is(exitCode, 0);

  // Test if the output is really a URL
  const { host } = new URL(stdout);
  t.is(host.split('-')[0], session);
});

test('create a staging deployment', async t => {
  const directory = fixture('static-deployment');

  const args = ['--debug', '--public', '--name', session, ...defaultArgs];
  const targetCall = await execa(binaryPath, [
    directory,
    '--target=staging',
    ...args,
    '--confirm',
  ]);

  console.log(targetCall.stderr);
  console.log(targetCall.stdout);
  console.log(targetCall.exitCode);

  t.regex(
    targetCall.stderr,
    /Setting target to staging/gm,
    formatOutput(targetCall)
  );
  t.regex(targetCall.stdout, /https:\/\//gm);
  t.is(targetCall.exitCode, 0, formatOutput(targetCall));

  const { host } = new URL(targetCall.stdout);
  const deployment = await apiFetch(
    `/v10/now/deployments/unknown?url=${host}`
  ).then(resp => resp.json());
  t.is(deployment.target, 'staging', JSON.stringify(deployment, null, 2));
});

test('create a production deployment', async t => {
  const directory = fixture('static-deployment');

  const args = ['--debug', '--public', '--name', session, ...defaultArgs];
  const targetCall = await execa(binaryPath, [
    directory,
    '--target=production',
    ...args,
    '--confirm',
  ]);

  console.log(targetCall.stderr);
  console.log(targetCall.stdout);
  console.log(targetCall.exitCode);

  t.is(targetCall.exitCode, 0, formatOutput(targetCall));
  t.regex(
    targetCall.stderr,
    /`--prod` option instead/gm,
    formatOutput(targetCall)
  );
  t.regex(
    targetCall.stderr,
    /Setting target to production/gm,
    formatOutput(targetCall)
  );
  t.regex(
    targetCall.stderr,
    /Inspect: https:\/\/vercel.com\//gm,
    formatOutput(targetCall)
  );
  t.regex(targetCall.stdout, /https:\/\//gm);

  const { host: targetHost } = new URL(targetCall.stdout);
  const targetDeployment = await apiFetch(
    `/v10/now/deployments/unknown?url=${targetHost}`
  ).then(resp => resp.json());
  t.is(
    targetDeployment.target,
    'production',
    JSON.stringify(targetDeployment, null, 2)
  );

  const call = await execa(binaryPath, [directory, '--prod', ...args]);

  console.log(call.stderr);
  console.log(call.stdout);
  console.log(call.exitCode);

  t.is(call.exitCode, 0, formatOutput(call));
  t.regex(
    call.stderr,
    /Setting target to production/gm,
    formatOutput(targetCall)
  );
  t.regex(call.stdout, /https:\/\//gm);

  const { host } = new URL(call.stdout);
  const deployment = await apiFetch(
    `/v10/now/deployments/unknown?url=${host}`
  ).then(resp => resp.json());
  t.is(deployment.target, 'production', JSON.stringify(deployment, null, 2));
});

test('deploying a file should not show prompts and display deprecation', async t => {
  const file = fixture('static-single-file/first.png');

  const output = await execute([file], {
    reject: false,
  });

  const { stdout, stderr, exitCode } = output;

  // Ensure the exit code is right
  t.is(exitCode, 0, formatOutput(output));
  t.true(stderr.includes('Deploying files with Vercel is deprecated'));

  // Ensure `.vercel` was not created
  t.is(
    await exists(path.join(path.dirname(file), '.vercel')),
    false,
    '.vercel should not exists'
  );

  // Test if the output is really a URL
  const { href, host } = new URL(stdout);
  t.is(host.split('-')[0], 'files');

  // Send a test request to the deployment
  const response = await fetch(href);
  const contentType = response.headers.get('content-type');

  t.is(contentType, 'image/png');
  t.deepEqual(await readFile(file), await response.buffer());
});

test('deploying more than 1 path should fail', async t => {
  const file1 = fixture('static-multiple-files/first.png');
  const file2 = fixture('static-multiple-files/second.png');

  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    [file1, file2, '--public', '--name', session, ...defaultArgs, '--confirm'],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  // Ensure the exit code is right
  t.is(exitCode, 1);
  t.true(stderr.trim().endsWith(`Can't deploy more than one path.`));
});

test('use build-env', async t => {
  const directory = fixture('build-env');

  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    [directory, '--public', ...defaultArgs, '--confirm'],
    {
      reject: false,
    }
  );

  // Ensure the exit code is right
  t.is(exitCode, 0, formatOutput({ stderr, stdout }));

  // Test if the output is really a URL
  const deploymentUrl = pickUrl(stdout);
  const { href } = new URL(deploymentUrl);

  await waitForDeployment(href);

  // get the content
  const response = await fetch(href);
  const content = await response.text();
  t.is(content.trim(), 'bar');
});

test('use `--debug` CLI flag', async t => {
  const directory = fixture('build-env-debug');

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [
      directory,
      '--public',
      '--name',
      session,
      '--debug',
      ...defaultArgs,
      '--confirm',
    ],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  // Ensure the exit code is right
  t.is(exitCode, 0, `Received:\n"${stderr}"\n"${stdout}"`);

  // Test if the output is really a URL
  const deploymentUrl = pickUrl(stdout);
  const { href, host } = new URL(deploymentUrl);
  t.is(host.split('-')[0], session);

  await waitForDeployment(href);

  // get the content
  const response = await fetch(href);
  const content = await response.text();
  t.is(content.trim(), 'off');
});

test('try to deploy non-existing path', async t => {
  const goal = `Error! The specified file or directory "${session}" does not exist.`;

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [session, ...defaultArgs, '--confirm'],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 1);
  t.true(stderr.trim().endsWith(goal));
});

test('try to deploy with non-existing team', async t => {
  const target = fixture('static-deployment');
  const goal = `Error! The specified scope does not exist`;

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [target, '--scope', session, ...defaultArgs, '--confirm'],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 1);
  t.true(stderr.includes(goal));
});

const verifyExampleAngular = (cwd, dir) =>
  fs.existsSync(path.join(cwd, dir, 'package.json')) &&
  fs.existsSync(path.join(cwd, dir, 'tsconfig.json')) &&
  fs.existsSync(path.join(cwd, dir, 'angular.json'));

const verifyExampleAmp = (cwd, dir) =>
  fs.existsSync(path.join(cwd, dir, 'index.html')) &&
  fs.existsSync(path.join(cwd, dir, 'logo.png')) &&
  fs.existsSync(path.join(cwd, dir, 'favicon.png'));

test('initialize example "angular"', async t => {
  tmpDir = tmp.dirSync({ unsafeCleanup: true });
  const cwd = tmpDir.name;
  const goal = '> Success! Initialized "angular" example in';

  const { stdout, stderr, exitCode } = await execute(['init', 'angular'], {
    cwd,
  });

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 0, formatOutput({ stdout, stderr }));
  t.true(stdout.includes(goal), formatOutput({ stdout, stderr }));
  t.true(
    verifyExampleAngular(cwd, 'angular'),
    formatOutput({ stdout, stderr })
  );
});

test('initialize example ("angular") to specified directory', async t => {
  tmpDir = tmp.dirSync({ unsafeCleanup: true });
  const cwd = tmpDir.name;
  const goal = '> Success! Initialized "angular" example in';

  const { stdout, stderr, exitCode } = await execute(
    ['init', 'angular', 'ang'],
    {
      cwd,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 0);
  t.true(stdout.includes(goal));
  t.true(verifyExampleAngular(cwd, 'ang'));
});

test('initialize selected example ("amp")', async t => {
  tmpDir = tmp.dirSync({ unsafeCleanup: true });
  const cwd = tmpDir.name;
  const goal = '> Success! Initialized "amp" example in';

  const { stdout, stderr, exitCode } = await execute(['init'], {
    cwd,
    input: '\n',
  });

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 0, formatOutput({ stdout, stderr }));
  t.true(stdout.includes(goal), formatOutput({ stdout, stderr }));
  t.true(verifyExampleAmp(cwd, 'amp'), formatOutput({ stdout, stderr }));
});

test('initialize example to existing directory with "-f"', async t => {
  tmpDir = tmp.dirSync({ unsafeCleanup: true });
  const cwd = tmpDir.name;
  const goal = '> Success! Initialized "angular" example in';

  await ensureDir(path.join(cwd, 'angular'));
  createFile(path.join(cwd, 'angular', '.gitignore'));
  const { stdout, stderr, exitCode } = await execute(
    ['init', 'angular', '-f'],
    {
      cwd,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 0);
  t.true(stdout.includes(goal), formatOutput({ stdout, stderr }));
  t.true(verifyExampleAngular(cwd, 'angular'));
});

test('try to initialize example to existing directory', async t => {
  tmpDir = tmp.dirSync({ unsafeCleanup: true });
  const cwd = tmpDir.name;
  const goal =
    'Error! Destination path "angular" already exists and is not an empty directory. You may use `--force` or `-f` to override it.';

  await ensureDir(path.join(cwd, 'angular'));
  createFile(path.join(cwd, 'angular', '.gitignore'));
  const { stdout, stderr, exitCode } = await execute(['init', 'angular'], {
    cwd,
    input: '\n',
  });

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 1);
  t.true(stdout.includes(goal), formatOutput({ stdout, stderr }));
});

test('try to initialize misspelled example (noce) in non-tty', async t => {
  tmpDir = tmp.dirSync({ unsafeCleanup: true });
  const cwd = tmpDir.name;
  const goal =
    'Error! No example found for noce, run `vercel init` to see the list of available examples.';

  const { stdout, stderr, exitCode } = await execute(['init', 'noce'], { cwd });

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 1);
  t.true(stdout.includes(goal), formatOutput({ stdout, stderr }));
});

test('try to initialize example "example-404"', async t => {
  tmpDir = tmp.dirSync({ unsafeCleanup: true });
  const cwd = tmpDir.name;
  const goal =
    'Error! No example found for example-404, run `vercel init` to see the list of available examples.';

  const { stdout, stderr, exitCode } = await execute(['init', 'example-404'], {
    cwd,
  });

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 1);
  t.true(stdout.includes(goal), formatOutput({ stdout, stderr }));
});

test('try to revert a deployment and assign the automatic aliases', async t => {
  const firstDeployment = fixture('now-revert-alias-1');
  const secondDeployment = fixture('now-revert-alias-2');

  const { name } = JSON.parse(
    fs.readFileSync(path.join(firstDeployment, 'now.json'))
  );
  const url = `https://${name}.user.vercel.app`;

  {
    const { stdout: deploymentUrl, stderr, exitCode } = await execute([
      firstDeployment,
      '--confirm',
    ]);

    t.is(exitCode, 0, formatOutput({ stderr, stdout: deploymentUrl }));

    await waitForDeployment(deploymentUrl);
    await sleep(20000);

    const result = await fetch(url).then(r => r.json());

    t.is(
      result.name,
      'now-revert-alias-1',
      `[First run] Received ${result.name} instead on ${url} (${deploymentUrl})`
    );
  }

  {
    const { stdout: deploymentUrl, stderr, exitCode } = await execute([
      secondDeployment,
      '--confirm',
    ]);

    t.is(exitCode, 0, formatOutput({ stderr, stdout: deploymentUrl }));

    await waitForDeployment(deploymentUrl);
    await sleep(20000);
    await fetch(url);
    await sleep(5000);

    const result = await fetch(url).then(r => r.json());

    t.is(
      result.name,
      'now-revert-alias-2',
      `[Second run] Received ${result.name} instead on ${url} (${deploymentUrl})`
    );
  }

  {
    const { stdout: deploymentUrl, stderr, exitCode } = await execute([
      firstDeployment,
      '--confirm',
    ]);

    t.is(exitCode, 0, formatOutput({ stderr, stdout: deploymentUrl }));

    await waitForDeployment(deploymentUrl);
    await sleep(20000);
    await fetch(url);
    await sleep(5000);

    const result = await fetch(url).then(r => r.json());

    t.is(
      result.name,
      'now-revert-alias-1',
      `[Third run] Received ${result.name} instead on ${url} (${deploymentUrl})`
    );
  }
});

test('whoami', async t => {
  const { exitCode, stdout, stderr } = await execute(['whoami']);

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 0);
  t.is(stdout, contextName, formatOutput({ stdout, stderr }));
});

test('fail `now dev` dev script without now.json', async t => {
  const deploymentPath = fixture('now-dev-fail-dev-script');
  const { exitCode, stderr } = await execute(['dev', deploymentPath]);

  t.is(exitCode, 1);
  t.true(
    stderr.includes('must not contain `now dev`'),
    `Received instead: "${stderr}"`
  );
});

test('`vercel rm` removes a deployment', async t => {
  const directory = fixture('static-deployment');

  const { stdout } = await execa(
    binaryPath,
    [
      directory,
      '--public',
      '--name',
      session,
      ...defaultArgs,
      '-V',
      2,
      '--force',
      '--confirm',
    ],
    {
      reject: false,
    }
  );

  const { host } = new URL(stdout);
  const { exitCode, stdout: stdoutRemove } = await execute([
    'rm',
    host,
    '--yes',
  ]);

  t.truthy(stdoutRemove.includes(host));
  t.is(exitCode, 0);
});

test('`vercel rm` should fail with unexpected option', async t => {
  const output = await execute(['rm', 'example.example.com', '--fake']);

  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(
    output.stderr,
    /Error! unknown or unexpected option: --fake/gm,
    formatOutput(output)
  );
});

test('`vercel rm` 404 exits quickly', async t => {
  const start = Date.now();
  const { exitCode, stderr, stdout } = await execute([
    'rm',
    'this.is.a.deployment.that.does.not.exist.example.com',
  ]);

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  const delta = Date.now() - start;

  // "does not exist" case is exit code 1, similar to Unix `rm`
  t.is(exitCode, 1);
  t.truthy(
    stderr.includes(
      'Could not find any deployments or projects matching "this.is.a.deployment.that.does.not.exist.example.com"'
    )
  );

  // "quickly" meaning < 5 seconds, because it used to hang from a previous bug
  t.truthy(delta < 5000);
});

test('render build errors', async t => {
  const deploymentPath = fixture('failing-build');
  const output = await execute([deploymentPath, '--confirm']);

  console.log(output.stderr);
  console.log(output.stdout);
  console.log(output.exitCode);

  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(
    output.stderr,
    /Command "yarn run build" exited with 1/gm,
    formatOutput(output)
  );
});

test('invalid deployment, projects and alias names', async t => {
  const check = async (...args) => {
    const output = await execute(args);

    console.log(output.stderr);
    console.log(output.stdout);
    console.log(output.exitCode);

    const print = `\`${args.join(' ')}\`\n${formatOutput(output)}`;
    t.is(output.exitCode, 1, print);
    t.regex(output.stderr, /The provided argument/gm, print);
  };

  await Promise.all([
    check('alias', '/', 'test'),
    check('alias', 'test', '/'),
    check('rm', '/'),
    check('ls', '/'),
  ]);
});

test('vercel certs ls', async t => {
  const output = await execute(['certs', 'ls']);

  console.log(output.stderr);
  console.log(output.stdout);
  console.log(output.exitCode);

  t.is(output.exitCode, 0, formatOutput(output));
  t.regex(output.stderr, /certificates? found under/gm, formatOutput(output));
});

test('vercel certs ls --next=123456', async t => {
  const output = await execute(['certs', 'ls', '--next=123456']);

  console.log(output.stderr);
  console.log(output.stdout);
  console.log(output.exitCode);

  t.is(output.exitCode, 0, formatOutput(output));
  t.regex(output.stderr, /No certificates found under/gm, formatOutput(output));
});

test('vercel hasOwnProperty not a valid subcommand', async t => {
  const output = await execute(['hasOwnProperty']);

  console.log(output.stderr);
  console.log(output.stdout);
  console.log(output.exitCode);

  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(
    output.stderr,
    /The specified file or directory "hasOwnProperty" does not exist/gm,
    formatOutput(output)
  );
});

test('create zero-config deployment', async t => {
  const fixturePath = fixture('zero-config-next-js');
  const output = await execute([
    fixturePath,
    '--force',
    '--public',
    '--confirm',
  ]);

  console.log('isCanary', isCanary);
  console.log(output.stderr);
  console.log(output.stdout);
  console.log(output.exitCode);

  t.is(output.exitCode, 0, formatOutput(output));

  const { host } = new URL(output.stdout);
  const response = await apiFetch(`/v10/now/deployments/unkown?url=${host}`);

  const text = await response.text();

  t.is(response.status, 200, text);
  const data = JSON.parse(text);

  t.is(data.error, undefined, JSON.stringify(data, null, 2));

  const validBuilders = data.builds.every(build =>
    isCanary ? build.use.endsWith('@canary') : !build.use.endsWith('@canary')
  );

  t.true(
    validBuilders,
    'Builders are not valid: ' + JSON.stringify(data, null, 2)
  );
});

test('next unsupported functions config shows warning link', async t => {
  const fixturePath = fixture('zero-config-next-js-functions-warning');
  const output = await execute([
    fixturePath,
    '--force',
    '--public',
    '--confirm',
  ]);

  console.log('isCanary', isCanary);
  console.log(output.stderr);
  console.log(output.stdout);
  console.log(output.exitCode);

  t.is(output.exitCode, 0, formatOutput(output));
  t.regex(
    output.stderr,
    /Ignoring function property `runtime`\. When using Next\.js, only `memory` and `maxDuration` can be used\./gm,
    formatOutput(output)
  );
  t.regex(
    output.stderr,
    /Learn More: https:\/\/vercel\.link\/functions-property-next/gm,
    formatOutput(output)
  );
});

test('vercel secret add', async t => {
  context.secretName = `my-secret-${Date.now().toString(36)}`;
  const value = 'https://my-secret-endpoint.com';

  const output = await execute(['secret', 'add', context.secretName, value]);

  console.log(output.stderr);
  console.log(output.stdout);
  console.log(output.exitCode);

  t.is(output.exitCode, 0, formatOutput(output));
});

test('vercel secret ls', async t => {
  const output = await execute(['secret', 'ls']);

  console.log(output.stderr);
  console.log(output.stdout);
  console.log(output.exitCode);

  t.is(output.exitCode, 0, formatOutput(output));
  t.regex(output.stdout, /Secrets found under/gm, formatOutput(output));
  t.regex(output.stdout, new RegExp(), formatOutput(output));
});

test('vercel secret ls --test-warning', async t => {
  const output = await execute(['secret', 'ls', '--test-warning']);

  t.is(output.exitCode, 0, formatOutput(output));
  t.regex(output.stderr, /Test warning message./gm, formatOutput(output));
  t.regex(
    output.stderr,
    /Learn more: https:\/\/vercel.com/gm,
    formatOutput(output)
  );
  t.regex(output.stdout, /No secrets found under/gm, formatOutput(output));
});

test('vercel secret rename', async t => {
  const nextName = `renamed-secret-${Date.now().toString(36)}`;
  const output = await execute([
    'secret',
    'rename',
    context.secretName,
    nextName,
  ]);

  console.log(output.stderr);
  console.log(output.stdout);
  console.log(output.exitCode);

  t.is(output.exitCode, 0, formatOutput(output));

  context.secretName = nextName;
});

test('vercel secret rm', async t => {
  const output = await execute(['secret', 'rm', context.secretName, '-y']);

  console.log(output.stderr);
  console.log(output.stdout);
  console.log(output.exitCode);

  t.is(output.exitCode, 0, formatOutput(output));
});

test('deploy a Lambda with 128MB of memory', async t => {
  const directory = fixture('lambda-with-128-memory');
  const output = await execute([directory, '--confirm']);

  t.is(output.exitCode, 0, formatOutput(output));

  const { host: url } = new URL(output.stdout);
  const response = await fetch('https://' + url + '/api/memory');

  t.is(response.status, 200, url);

  // It won't be exactly 128MB,
  // so we just compare if it is lower than 450MB
  const { memory } = await response.json();
  t.is(memory, 128, `Lambda has ${memory} bytes of memory`);
});

test('fail to deploy a Lambda with an incorrect value for of memory', async t => {
  const directory = fixture('lambda-with-200-memory');
  const output = await execute([directory, '--confirm']);

  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(output.stderr, /steps of 64/gm, formatOutput(output));
  t.regex(output.stderr, /Learn More/gm, formatOutput(output));
});

test('deploy a Lambda with 3 seconds of maxDuration', async t => {
  const directory = fixture('lambda-with-3-second-timeout');
  const output = await execute([directory, '--confirm']);

  t.is(output.exitCode, 0, formatOutput(output));

  const { host: url } = new URL(output.stdout);

  const [response1, response2] = await Promise.all([
    fetch('https://' + url + '/api/wait-for/2'),
    fetch('https://' + url + '/api/wait-for/4'),
  ]);

  t.is(response1.status, 200, url);
  t.is(response2.status, 504, url);
});

test('fail to deploy a Lambda with an incorrect value for maxDuration', async t => {
  const directory = fixture('lambda-with-1000-second-timeout');
  const output = await execute([directory, '--confirm']);

  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(
    output.stderr,
    /maxDuration must be between 1 second and 10 seconds/gm,
    formatOutput(output)
  );
});

test('invalid `--token`', async t => {
  const output = await execute(['--token', 'he\nl,o.']);

  t.is(output.exitCode, 1, formatOutput(output));
  t.true(
    output.stderr.includes(
      'Error! You defined "--token", but its contents are invalid. Must not contain: "\\n", ",", "."'
    )
  );
});

test('deploy a Lambda with a specific runtime', async t => {
  const directory = fixture('lambda-with-php-runtime');
  const output = await execute([directory, '--public', '--confirm']);

  t.is(output.exitCode, 0, formatOutput(output));

  const { host: url } = new URL(output.stdout);

  const builds = await getDeploymentBuildsByUrl(url);
  const build = builds.find(b => b.use && b.use.includes('php')) || builds[0];
  t.is(build.use, 'vercel-php@0.1.0', JSON.stringify(build, null, 2));
});

test('fail to deploy a Lambda with a specific runtime but without a locked version', async t => {
  const directory = fixture('lambda-with-invalid-runtime');
  const output = await execute([directory, '--confirm']);

  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(
    output.stderr,
    /Function Runtimes must have a valid version/gim,
    formatOutput(output)
  );
});

test('fail to add a domain without a project', async t => {
  const output = await execute(['domains', 'add', 'my-domain.vercel.app']);
  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(output.stderr, /expects two arguments/gm, formatOutput(output));
});

test('change user', async t => {
  t.timeout(ms('1m'));

  const { stdout: prevUser } = await execute(['whoami']);

  // Delete the current token
  await execute(['logout', '--debug'], { stdio: 'inherit' });

  await createUser();

  await execute(['login', email, '--api', loginApiUrl, '--debug'], {
    stdio: 'inherit',
  });

  const auth = await fs.readJSON(getConfigAuthPath());
  t.is(auth.token, token);

  const { stdout: nextUser } = await execute(['whoami']);

  console.log('prev user', prevUser);
  console.log('next user', nextUser);

  t.is(typeof prevUser, 'string', prevUser);
  t.is(typeof nextUser, 'string', nextUser);
  t.not(prevUser, nextUser, JSON.stringify({ prevUser, nextUser }));
});

test('assign a domain to a project', async t => {
  const domain = `project-domain.${contextName}.vercel.app`;
  const directory = fixture('static-deployment');

  const deploymentOutput = await execute([directory, '--public', '--confirm']);
  t.is(deploymentOutput.exitCode, 0, formatOutput(deploymentOutput));

  const host = deploymentOutput.stdout.trim().replace('https://', '');
  const deployment = await apiFetch(
    `/v10/now/deployments/unknown?url=${host}`
  ).then(resp => resp.json());

  t.is(typeof deployment.name, 'string', JSON.stringify(deployment, null, 2));
  const project = deployment.name;

  const output = await execute(['domains', 'add', domain, project, '--force']);
  t.is(output.exitCode, 0, formatOutput(output));

  const removeResponse = await execute(['rm', project, '-y']);
  t.is(removeResponse.exitCode, 0, formatOutput(removeResponse));
});

test('ensure `github` and `scope` are not sent to the API', async t => {
  const directory = fixture('github-and-scope-config');
  const output = await execute([directory, '--confirm']);

  t.is(output.exitCode, 0, formatOutput(output));
});

test('should show prompts to set up project during first deploy', async t => {
  const directory = fixture('project-link-deploy');
  const projectName = `project-link-deploy-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(directory, '.vercel'));

  const now = execa(binaryPath, [directory, ...defaultArgs]);

  await waitForPrompt(now, chunk => /Set up and deploy [^?]+\?/.test(chunk));
  now.stdin.write('yes\n');

  await waitForPrompt(now, chunk =>
    chunk.includes('Which scope do you want to deploy to?')
  );
  now.stdin.write('\n');

  await waitForPrompt(now, chunk =>
    chunk.includes('Link to existing project?')
  );
  now.stdin.write('no\n');

  await waitForPrompt(now, chunk =>
    chunk.includes('What’s your project’s name?')
  );
  now.stdin.write(`${projectName}\n`);

  await waitForPrompt(now, chunk =>
    chunk.includes('In which directory is your code located?')
  );
  now.stdin.write('\n');

  await waitForPrompt(now, chunk =>
    chunk.includes('Want to override the settings?')
  );
  now.stdin.write('yes\n');

  await waitForPrompt(now, chunk =>
    chunk.includes(
      'Which settings would you like to overwrite (select multiple)?'
    )
  );
  now.stdin.write('a\n'); // 'a' means select all

  await waitForPrompt(now, chunk =>
    chunk.includes(`What's your Build Command?`)
  );
  now.stdin.write(
    `mkdir -p o && echo '<h1>custom hello</h1>' > o/index.html\n`
  );

  await waitForPrompt(now, chunk =>
    chunk.includes(`What's your Output Directory?`)
  );
  now.stdin.write(`o\n`);

  await waitForPrompt(now, chunk =>
    chunk.includes(`What's your Development Command?`)
  );
  now.stdin.write(`\n`);

  await waitForPrompt(now, chunk => chunk.includes('Linked to'));

  const output = await now;

  // Ensure the exit code is right
  t.is(output.exitCode, 0, formatOutput(output));

  // Ensure .gitignore is created
  t.is(
    (await readFile(path.join(directory, '.gitignore'))).toString(),
    '.vercel\n'
  );

  // Ensure .vercel/project.json and .vercel/README.txt are created
  t.is(
    await exists(path.join(directory, '.vercel', 'project.json')),
    true,
    'project.json should be created'
  );
  t.is(
    await exists(path.join(directory, '.vercel', 'README.txt')),
    true,
    'README.txt should be created'
  );

  // Send a test request to the deployment
  const response = await fetch(new URL(output.stdout).href);
  const text = await response.text();
  t.is(text.includes('<h1>custom hello</h1>'), true, text);

  // Ensure that `vc dev` also uses the configured build command
  // and output directory
  let stderr = '';
  const port = 58351;
  const dev = execa(binaryPath, [
    'dev',
    '--listen',
    port,
    directory,
    ...defaultArgs,
  ]);
  dev.stderr.setEncoding('utf8');

  try {
    dev.stdout.pipe(process.stdout);
    dev.stderr.pipe(process.stderr);
    await new Promise((resolve, reject) => {
      dev.once('exit', (code, signal) => {
        reject(`"vc dev" failed with ${signal || code}`);
      });
      dev.stderr.on('data', data => {
        stderr += data;
        if (stderr.includes('Ready! Available at')) {
          resolve();
        }
      });
    });

    const res2 = await fetch(`http://localhost:${port}/`);
    const text2 = await res2.text();
    t.is(text2.includes('<h1>custom hello</h1>'), true, text2);
  } finally {
    process.kill(dev.pid, 'SIGTERM');
  }
});

test('should prefill "project name" prompt with folder name', async t => {
  const projectName = `static-deployment-${
    Math.random().toString(36).split('.')[1]
  }`;

  const src = fixture('static-deployment');

  // remove previously linked project if it exists
  await remove(path.join(src, '.vercel'));

  const directory = path.join(src, '../', projectName);
  await copy(src, directory);

  const now = execa(binaryPath, [directory, ...defaultArgs]);

  await waitForPrompt(now, chunk => /Set up and deploy [^?]+\?/.test(chunk));
  now.stdin.write('yes\n');

  await waitForPrompt(now, chunk =>
    chunk.includes('Which scope do you want to deploy to?')
  );
  now.stdin.write('\n');

  await waitForPrompt(now, chunk =>
    chunk.includes('Link to existing project?')
  );
  now.stdin.write('no\n');

  await waitForPrompt(now, chunk =>
    chunk.includes(`What’s your project’s name? (${projectName})`)
  );
  now.stdin.write(`\n`);

  await waitForPrompt(now, chunk =>
    chunk.includes('In which directory is your code located?')
  );
  now.stdin.write('\n');

  await waitForPrompt(now, chunk =>
    chunk.includes('Want to override the settings?')
  );
  now.stdin.write('no\n');

  const output = await now;
  t.is(output.exitCode, 0, formatOutput(output));
});

test('should prefill "project name" prompt with --name', async t => {
  const directory = fixture('static-deployment');
  const projectName = `static-deployment-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(directory, '.vercel'));

  const now = execa(binaryPath, [
    directory,
    '--name',
    projectName,
    ...defaultArgs,
  ]);

  let isDeprecated = false;

  await waitForPrompt(now, chunk => {
    if (chunk.includes('The "--name" option is deprecated')) {
      isDeprecated = true;
    }

    return /Set up and deploy [^?]+\?/.test(chunk);
  });
  now.stdin.write('yes\n');

  t.is(isDeprecated, true);

  await waitForPrompt(now, chunk =>
    chunk.includes('Which scope do you want to deploy to?')
  );
  now.stdin.write('\n');

  await waitForPrompt(now, chunk =>
    chunk.includes('Link to existing project?')
  );
  now.stdin.write('no\n');

  await waitForPrompt(now, chunk =>
    chunk.includes(`What’s your project’s name? (${projectName})`)
  );
  now.stdin.write(`\n`);

  await waitForPrompt(now, chunk =>
    chunk.includes('In which directory is your code located?')
  );
  now.stdin.write('\n');

  await waitForPrompt(now, chunk =>
    chunk.includes('Want to override the settings?')
  );
  now.stdin.write('no\n');

  const output = await now;
  t.is(output.exitCode, 0, formatOutput(output));
});

test('should prefill "project name" prompt with now.json `name`', async t => {
  const directory = fixture('static-deployment');
  const projectName = `static-deployment-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(directory, '.vercel'));
  await fs.writeFile(
    path.join(directory, 'vercel.json'),
    JSON.stringify({
      name: projectName,
    })
  );

  const now = execa(binaryPath, [directory, ...defaultArgs]);

  let isDeprecated = false;

  now.stderr.on('data', data => {
    if (
      data
        .toString()
        .includes('The `name` property in vercel.json is deprecated')
    ) {
      isDeprecated = true;
    }
  });

  await waitForPrompt(now, chunk => {
    return /Set up and deploy [^?]+\?/.test(chunk);
  });
  now.stdin.write('yes\n');

  await waitForPrompt(now, chunk =>
    chunk.includes('Which scope do you want to deploy to?')
  );
  now.stdin.write('\n');

  await waitForPrompt(now, chunk =>
    chunk.includes('Link to existing project?')
  );
  now.stdin.write('no\n');

  await waitForPrompt(now, chunk =>
    chunk.includes(`What’s your project’s name? (${projectName})`)
  );
  now.stdin.write(`\n`);

  await waitForPrompt(now, chunk =>
    chunk.includes('In which directory is your code located?')
  );
  now.stdin.write('\n');

  await waitForPrompt(now, chunk =>
    chunk.includes('Want to override the settings?')
  );
  now.stdin.write('no\n');

  const output = await now;
  t.is(output.exitCode, 0, formatOutput(output));

  t.is(isDeprecated, true);

  // clean up
  await remove(path.join(directory, 'vercel.json'));
});

test('deploy with unknown `VERCEL_PROJECT_ID` should fail', async t => {
  const directory = fixture('static-deployment');
  const user = await fetchTokenInformation(token);

  const output = await execute([directory], {
    env: {
      VERCEL_ORG_ID: user.uid,
      VERCEL_PROJECT_ID: 'asdf',
    },
  });

  t.is(output.exitCode, 1, formatOutput(output));
  t.is(output.stderr.includes('Project not found'), true, formatOutput(output));
});

test('deploy with `VERCEL_ORG_ID` but without `VERCEL_PROJECT_ID` should fail', async t => {
  const directory = fixture('static-deployment');
  const user = await fetchTokenInformation(token);

  const output = await execute([directory], {
    env: { VERCEL_ORG_ID: user.uid },
  });

  t.is(output.exitCode, 1, formatOutput(output));
  t.is(
    output.stderr.includes(
      'You specified `VERCEL_ORG_ID` but you forgot to specify `VERCEL_PROJECT_ID`. You need to specify both to deploy to a custom project.'
    ),
    true,
    formatOutput(output)
  );
});

test('deploy with `VERCEL_PROJECT_ID` but without `VERCEL_ORG_ID` should fail', async t => {
  const directory = fixture('static-deployment');

  const output = await execute([directory], {
    env: { VERCEL_PROJECT_ID: 'asdf' },
  });

  t.is(output.exitCode, 1, formatOutput(output));
  t.is(
    output.stderr.includes(
      'You specified `VERCEL_PROJECT_ID` but you forgot to specify `VERCEL_ORG_ID`. You need to specify both to deploy to a custom project.'
    ),
    true,
    formatOutput(output)
  );
});

test('deploy with `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`', async t => {
  const directory = fixture('static-deployment');

  // generate `.vercel`
  await execute([directory, '--confirm']);

  const link = require(path.join(directory, '.vercel/project.json'));
  await remove(path.join(directory, '.vercel'));

  const output = await execute([directory], {
    env: {
      VERCEL_ORG_ID: link.orgId,
      VERCEL_PROJECT_ID: link.projectId,
    },
  });

  t.is(output.exitCode, 0, formatOutput(output));
  t.is(output.stdout.includes('Linked to'), false);
});

test('deploy shows notice when project in `.vercel` does not exists', async t => {
  const directory = fixture('static-deployment');

  // overwrite .vercel with unexisting project
  await ensureDir(path.join(directory, '.vercel'));
  await writeFile(
    path.join(directory, '.vercel/project.json'),
    JSON.stringify({
      orgId: 'asdf',
      projectId: 'asdf',
    })
  );

  const now = execute([directory]);

  let detectedNotice = false;

  // kill after first prompt
  await waitForPrompt(now, chunk => {
    detectedNotice =
      detectedNotice ||
      chunk.includes(
        'Your Project was either deleted, transferred to a new Team, or you don’t have access to it anymore'
      );

    return /Set up and deploy [^?]+\?/.test(chunk);
  });
  now.stdin.write('no\n');

  t.is(detectedNotice, true, 'did not detect notice');
});

test('use `rootDirectory` from project when deploying', async t => {
  const directory = fixture('project-root-directory');

  const firstResult = await execute([directory, '--confirm', '--public']);
  t.is(firstResult.exitCode, 0, formatOutput(firstResult));

  const { host: firstHost } = new URL(firstResult.stdout);
  const response = await apiFetch(`/v12/now/deployments/get?url=${firstHost}`);
  t.is(response.status, 200);
  const { projectId } = await response.json();
  t.is(typeof projectId, 'string', projectId);

  const projectResponse = await apiFetch(`/v2/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      rootDirectory: 'src',
    }),
  });
  console.log('response', await projectResponse.text());
  t.is(projectResponse.status, 200);

  const secondResult = await execute([directory, '--public']);
  t.is(secondResult.exitCode, 0, formatOutput(secondResult));

  const pageResponse1 = await fetch(secondResult.stdout);
  t.is(pageResponse1.status, 200);
  t.regex(await pageResponse1.text(), /I am a website/gm);

  // Ensures that the `now.json` file has been applied
  const pageResponse2 = await fetch(`${secondResult.stdout}/i-do-exist`);
  t.is(pageResponse2.status, 200);
  t.regex(await pageResponse2.text(), /I am a website/gm);

  await apiFetch(`/v2/projects/${projectId}`, {
    method: 'DELETE',
  });
});

test('vercel deploy with unknown `VERCEL_ORG_ID` or `VERCEL_PROJECT_ID` should error', async t => {
  const output = await execute(['deploy'], {
    env: { VERCEL_ORG_ID: 'asdf', VERCEL_PROJECT_ID: 'asdf' },
  });

  t.is(output.exitCode, 1, formatOutput(output));
  t.is(output.stderr.includes('Project not found'), true, formatOutput(output));
});

test('vercel env with unknown `VERCEL_ORG_ID` or `VERCEL_PROJECT_ID` should error', async t => {
  const output = await execute(['env'], {
    env: { VERCEL_ORG_ID: 'asdf', VERCEL_PROJECT_ID: 'asdf' },
  });

  t.is(output.exitCode, 1, formatOutput(output));
  t.is(output.stderr.includes('Project not found'), true, formatOutput(output));
});

test('whoami with `VERCEL_ORG_ID` should favor `--scope` and should error', async t => {
  const user = await fetchTokenInformation(token);

  const output = await execute(['whoami', '--scope', 'asdf'], {
    env: { VERCEL_ORG_ID: user.uid },
  });

  t.is(output.exitCode, 1, formatOutput(output));
  t.is(
    output.stderr.includes('The specified scope does not exist'),
    true,
    formatOutput(output)
  );
});

test('whoami with local .vercel scope', async t => {
  const directory = fixture('static-deployment');
  const user = await fetchTokenInformation(token);

  // create local .vercel
  await ensureDir(path.join(directory, '.vercel'));
  await fs.writeFile(
    path.join(directory, '.vercel', 'project.json'),
    JSON.stringify({ orgId: user.uid, projectId: 'xxx' })
  );

  const output = await execute(['whoami'], {
    cwd: directory,
  });

  t.is(output.exitCode, 0, formatOutput(output));
  t.is(output.stdout.includes(contextName), true, formatOutput(output));

  // clean up
  await remove(path.join(directory, '.vercel'));
});

test('deploys with only now.json and README.md', async t => {
  const directory = fixture('deploy-with-only-readme-now-json');

  const { exitCode, stderr, stdout } = await execa(
    binaryPath,
    [...defaultArgs, '--confirm'],
    {
      cwd: directory,
      reject: false,
    }
  );

  t.is(exitCode, 0, formatOutput({ stderr, stdout }));
  const { host } = new URL(stdout);
  const res = await fetch(`https://${host}/README.md`);
  const text = await res.text();
  t.regex(text, /readme contents/);
});

test('deploys with only vercel.json and README.md', async t => {
  const directory = fixture('deploy-with-only-readme-vercel-json');

  const { exitCode, stderr, stdout } = await execa(
    binaryPath,
    [...defaultArgs, '--confirm'],
    {
      cwd: directory,
      reject: false,
    }
  );

  t.is(exitCode, 0, formatOutput({ stderr, stdout }));
  const { host } = new URL(stdout);
  const res = await fetch(`https://${host}/README.md`);
  const text = await res.text();
  t.regex(text, /readme contents/);
});

test('reject conflicting `vercel.json` and `now.json` files', async t => {
  const directory = fixture('conflicting-now-json-vercel-json');

  const { exitCode, stderr, stdout } = await execa(
    binaryPath,
    [...defaultArgs, '--confirm'],
    {
      cwd: directory,
      reject: false,
    }
  );

  t.is(exitCode, 1, formatOutput({ stderr, stdout }));
  t.true(
    stderr.includes(
      'Cannot use both a `vercel.json` and `now.json` file. Please delete the `now.json` file.'
    ),
    formatOutput({ stderr, stdout })
  );
});

test('`vc --debug project ls` should output the projects listing', async t => {
  const { exitCode, stderr, stdout } = await execa(
    binaryPath,
    [...defaultArgs, '--debug', 'project', 'ls'],
    {
      reject: false,
    }
  );

  t.is(exitCode, 0, formatOutput({ stderr, stdout }));
  t.true(
    stdout.includes('> Projects found under'),
    formatOutput({ stderr, stdout })
  );
});

test('deploy gatsby twice and print cached directories', async t => {
  const directory = example('gatsby');
  const packageJsonPath = path.join(directory, 'package.json');
  const packageJsonOriginal = await readFile(packageJsonPath, 'utf8');
  const pkg = JSON.parse(packageJsonOriginal);

  async function tryDeploy(cwd) {
    await execa(binaryPath, [...defaultArgs, '--public', '--confirm'], {
      cwd,
      stdio: 'inherit',
      reject: true,
    });

    t.true(true);
  }

  // Deploy once to populate the cache
  await tryDeploy(directory);

  // Wait because the cache is not available right away
  // See https://codeburst.io/quick-explanation-of-the-s3-consistency-model-6c9f325e3f82
  await sleep(60000);

  // Update build script to ensure cached files were restored in the next deploy
  pkg.scripts.build = `ls -lA && ls .cache && ls public && ${pkg.scripts.build}`;
  await writeFile(packageJsonPath, JSON.stringify(pkg));
  try {
    await tryDeploy(directory);
  } finally {
    await writeFile(packageJsonPath, packageJsonOriginal);
  }
});

test('reject deploying with wrong team .vercel config', async t => {
  const directory = fixture('unauthorized-vercel-config');

  const { exitCode, stderr, stdout } = await execa(
    binaryPath,
    [...defaultArgs, '--confirm'],
    {
      cwd: directory,
      reject: false,
    }
  );

  t.is(exitCode, 1, formatOutput({ stderr, stdout }));
  t.true(
    stderr.includes(
      'Could not retrieve Project Settings. To link your Project, remove the `.vercel` directory and deploy again.'
    ),
    formatOutput({ stderr, stdout })
  );
});

test('[vc link] should show prompts to set up project', async t => {
  const dir = fixture('project-link-zeroconf');
  const projectName = `project-link-zeroconf-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const vc = execa(binaryPath, ['link', ...defaultArgs], { cwd: dir });

  await waitForPrompt(vc, chunk => /Set up [^?]+\?/.test(chunk));
  vc.stdin.write('yes\n');

  await waitForPrompt(vc, chunk =>
    chunk.includes('Which scope should contain your project?')
  );
  vc.stdin.write('\n');

  await waitForPrompt(vc, chunk => chunk.includes('Link to existing project?'));
  vc.stdin.write('no\n');

  await waitForPrompt(vc, chunk =>
    chunk.includes('What’s your project’s name?')
  );
  vc.stdin.write(`${projectName}\n`);

  await waitForPrompt(vc, chunk =>
    chunk.includes('In which directory is your code located?')
  );
  vc.stdin.write('\n');

  await waitForPrompt(vc, chunk =>
    chunk.includes('Want to override the settings?')
  );
  vc.stdin.write('yes\n');

  await waitForPrompt(vc, chunk =>
    chunk.includes(
      'Which settings would you like to overwrite (select multiple)?'
    )
  );
  vc.stdin.write('a\n'); // 'a' means select all

  await waitForPrompt(vc, chunk =>
    chunk.includes(`What's your Build Command?`)
  );
  vc.stdin.write(`mkdir -p o && echo '<h1>custom hello</h1>' > o/index.html\n`);

  await waitForPrompt(vc, chunk =>
    chunk.includes(`What's your Output Directory?`)
  );
  vc.stdin.write(`o\n`);

  await waitForPrompt(vc, chunk =>
    chunk.includes(`What's your Development Command?`)
  );
  vc.stdin.write(`\n`);

  await waitForPrompt(vc, chunk => chunk.includes('Linked to'));

  const output = await vc;

  // Ensure the exit code is right
  t.is(output.exitCode, 0, formatOutput(output));

  // Ensure .gitignore is created
  t.is((await readFile(path.join(dir, '.gitignore'))).toString(), '.vercel\n');

  // Ensure .vercel/project.json and .vercel/README.txt are created
  t.is(
    await exists(path.join(dir, '.vercel', 'project.json')),
    true,
    'project.json should be created'
  );
  t.is(
    await exists(path.join(dir, '.vercel', 'README.txt')),
    true,
    'README.txt should be created'
  );
});

test('[vc link --confirm] should not show prompts and autolink', async t => {
  const dir = fixture('project-link-confirm');

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const { exitCode, stderr, stdout } = await execa(
    binaryPath,
    ['link', '--confirm', ...defaultArgs],
    { cwd: dir, reject: false }
  );

  // Ensure the exit code is right
  t.is(exitCode, 0, formatOutput({ stderr, stdout }));

  // Ensure the message is correct pattern
  t.regex(stderr, /Linked to /m);

  // Ensure .gitignore is created
  t.is((await readFile(path.join(dir, '.gitignore'))).toString(), '.vercel\n');

  // Ensure .vercel/project.json and .vercel/README.txt are created
  t.is(
    await exists(path.join(dir, '.vercel', 'project.json')),
    true,
    'project.json should be created'
  );
  t.is(
    await exists(path.join(dir, '.vercel', 'README.txt')),
    true,
    'README.txt should be created'
  );
});

test('[vc dev] should show prompts to set up project', async t => {
  const dir = fixture('project-link-dev');
  const port = 58352;
  const projectName = `project-link-dev-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const dev = execa(binaryPath, ['dev', '--listen', port, ...defaultArgs], {
    cwd: dir,
  });

  await waitForPrompt(dev, chunk => /Set up and develop [^?]+\?/.test(chunk));
  dev.stdin.write('yes\n');

  await waitForPrompt(dev, chunk =>
    chunk.includes('Which scope should contain your project?')
  );
  dev.stdin.write('\n');

  await waitForPrompt(dev, chunk =>
    chunk.includes('Link to existing project?')
  );
  dev.stdin.write('no\n');

  await waitForPrompt(dev, chunk =>
    chunk.includes('What’s your project’s name?')
  );
  dev.stdin.write(`${projectName}\n`);

  await waitForPrompt(dev, chunk =>
    chunk.includes('In which directory is your code located?')
  );
  dev.stdin.write('\n');

  await waitForPrompt(dev, chunk =>
    chunk.includes('Want to override the settings?')
  );
  dev.stdin.write('yes\n');

  await waitForPrompt(dev, chunk =>
    chunk.includes(
      'Which settings would you like to overwrite (select multiple)?'
    )
  );
  dev.stdin.write('a\n'); // 'a' means select all

  await waitForPrompt(dev, chunk =>
    chunk.includes(`What's your Build Command?`)
  );
  dev.stdin.write(
    `mkdir -p o && echo '<h1>custom hello</h1>' > o/index.html\n`
  );

  await waitForPrompt(dev, chunk =>
    chunk.includes(`What's your Output Directory?`)
  );
  dev.stdin.write(`o\n`);

  await waitForPrompt(dev, chunk =>
    chunk.includes(`What's your Development Command?`)
  );
  dev.stdin.write(`\n`);

  await waitForPrompt(dev, chunk => chunk.includes('Linked to'));

  // Ensure .gitignore is created
  t.is((await readFile(path.join(dir, '.gitignore'))).toString(), '.vercel\n');

  // Ensure .vercel/project.json and .vercel/README.txt are created
  t.is(
    await exists(path.join(dir, '.vercel', 'project.json')),
    true,
    'project.json should be created'
  );
  t.is(
    await exists(path.join(dir, '.vercel', 'README.txt')),
    true,
    'README.txt should be created'
  );

  await waitForPrompt(dev, chunk => chunk.includes('Ready! Available at'));

  // Ensure that `vc dev` also works
  try {
    const response = await fetch(`http://localhost:${port}/`);
    const text = await response.text();
    t.is(text.includes('<h1>custom hello</h1>'), true, text);
  } finally {
    process.kill(dev.pid, 'SIGTERM');
  }
});

test('[vc link] should show project prompts but not framework when `builds` defined', async t => {
  const dir = fixture('project-link-legacy');
  const projectName = `project-link-legacy-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const vc = execa(binaryPath, ['link', ...defaultArgs], { cwd: dir });

  await waitForPrompt(vc, chunk => /Set up [^?]+\?/.test(chunk));
  vc.stdin.write('yes\n');

  await waitForPrompt(vc, chunk =>
    chunk.includes('Which scope should contain your project?')
  );
  vc.stdin.write('\n');

  await waitForPrompt(vc, chunk => chunk.includes('Link to existing project?'));
  vc.stdin.write('no\n');

  await waitForPrompt(vc, chunk =>
    chunk.includes('What’s your project’s name?')
  );
  vc.stdin.write(`${projectName}\n`);

  await waitForPrompt(vc, chunk =>
    chunk.includes('In which directory is your code located?')
  );
  vc.stdin.write('\n');

  await waitForPrompt(vc, chunk => chunk.includes('Linked to'));

  const output = await vc;

  // Ensure the exit code is right
  t.is(output.exitCode, 0, formatOutput(output));

  // Ensure .gitignore is created
  t.is((await readFile(path.join(dir, '.gitignore'))).toString(), '.vercel\n');

  // Ensure .vercel/project.json and .vercel/README.txt are created
  t.is(
    await exists(path.join(dir, '.vercel', 'project.json')),
    true,
    'project.json should be created'
  );
  t.is(
    await exists(path.join(dir, '.vercel', 'README.txt')),
    true,
    'README.txt should be created'
  );
});

test('[vc dev] should send the platform proxy request headers to frontend dev server ', async t => {
  const dir = fixture('dev-proxy-headers-and-env');
  const port = 58353;
  const projectName = `dev-proxy-headers-and-env-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const dev = execa(binaryPath, ['dev', '--listen', port, ...defaultArgs], {
    cwd: dir,
  });

  await waitForPrompt(dev, chunk => /Set up and develop [^?]+\?/.test(chunk));
  dev.stdin.write('yes\n');

  await waitForPrompt(dev, chunk =>
    chunk.includes('Which scope should contain your project?')
  );
  dev.stdin.write('\n');

  await waitForPrompt(dev, chunk =>
    chunk.includes('Link to existing project?')
  );
  dev.stdin.write('no\n');

  await waitForPrompt(dev, chunk =>
    chunk.includes('What’s your project’s name?')
  );
  dev.stdin.write(`${projectName}\n`);

  await waitForPrompt(dev, chunk =>
    chunk.includes('In which directory is your code located?')
  );
  dev.stdin.write('\n');

  await waitForPrompt(dev, chunk =>
    chunk.includes('Want to override the settings?')
  );
  dev.stdin.write('yes\n');

  await waitForPrompt(dev, chunk =>
    chunk.includes(
      'Which settings would you like to overwrite (select multiple)?'
    )
  );
  dev.stdin.write('a\n'); // 'a' means select all

  await waitForPrompt(dev, chunk =>
    chunk.includes(`What's your Build Command?`)
  );
  dev.stdin.write(
    `mkdir -p o && echo '<h1>custom hello</h1>' > o/index.html\n`
  );

  await waitForPrompt(dev, chunk =>
    chunk.includes(`What's your Output Directory?`)
  );
  dev.stdin.write(`o\n`);

  await waitForPrompt(dev, chunk =>
    chunk.includes(`What's your Development Command?`)
  );
  dev.stdin.write(`node server.js\n`);

  await waitForPrompt(dev, chunk => chunk.includes('Linked to'));
  await waitForPrompt(dev, chunk => chunk.includes('Ready! Available at'));

  // Ensure that `vc dev` also works
  try {
    const response = await fetch(`http://localhost:${port}/`);
    const body = await response.json();
    t.is(body.headers['x-vercel-deployment-url'], `localhost:${port}`);
    t.is(body.env.NOW_REGION, 'dev1');
  } finally {
    process.kill(dev.pid, 'SIGTERM');
  }
});
