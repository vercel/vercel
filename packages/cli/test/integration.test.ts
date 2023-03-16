// @ts-nocheck
// Note: this file is incrementally migrating to typescript
import ms from 'ms';
import path from 'path';
import { URL, parse as parseUrl } from 'url';
import semVer from 'semver';
import { Readable } from 'stream';
import { homedir, tmpdir } from 'os';
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
  mkdir,
} from 'fs-extra';
import logo from '../src/util/output/logo';
import sleep from '../src/util/sleep';
import pkg from '../package.json';
import prepareFixtures from './helpers/prepare';
import { fetchTokenWithRetry } from '../../../test/lib/deployment/now-deploy';
import { once } from 'node:events';

const TEST_TIMEOUT = 3 * 60 * 1000;
jest.setTimeout(TEST_TIMEOUT);

// log command when running `execa`
function execa(file, args, options) {
  console.log(`$ vercel ${args.join(' ')}`);
  return _execa(file, args, options);
}

function fixture(name) {
  const directory = path.join(tmpFixturesDir, name);
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

function formatOutput({ stderr, stdout }) {
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

async function vcLink(projectPath) {
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

const context = {};

const defaultOptions = { reject: false };
const defaultArgs = [];
let token;
let email;
let contextName;

let tmpDir;
let tmpFixturesDir = path.join(tmpdir(), 'tmp-fixtures');

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
    const handleTimeout = setTimeout(
      () => reject(new Error('timeout in waitForPrompt')),
      TEST_TIMEOUT / 2
    );
    const listener = chunk => {
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

async function setupProject(process, projectName, overrides) {
  await waitForPrompt(process, chunk => /Set up [^?]+\?/.test(chunk));
  process.stdin.write('yes\n');

  await waitForPrompt(process, chunk => /Which scope [^?]+\?/.test(chunk));
  process.stdin.write('\n');

  await waitForPrompt(process, chunk =>
    chunk.includes('Link to existing project?')
  );
  process.stdin.write('no\n');

  await waitForPrompt(process, chunk =>
    chunk.includes('What’s your project’s name?')
  );
  process.stdin.write(`${projectName}\n`);

  await waitForPrompt(process, chunk =>
    chunk.includes('In which directory is your code located?')
  );
  process.stdin.write('\n');

  await waitForPrompt(process, chunk =>
    chunk.includes('Want to modify these settings?')
  );

  if (overrides) {
    process.stdin.write('yes\n');

    const { buildCommand, outputDirectory, devCommand } = overrides;

    await waitForPrompt(process, chunk =>
      chunk.includes(
        'Which settings would you like to overwrite (select multiple)?'
      )
    );
    process.stdin.write('a\n'); // 'a' means select all

    await waitForPrompt(process, chunk =>
      chunk.includes(`What's your Build Command?`)
    );
    process.stdin.write(`${buildCommand || ''}\n`);

    await waitForPrompt(process, chunk =>
      chunk.includes(`What's your Development Command?`)
    );
    process.stdin.write(`${devCommand || ''}\n`);

    await waitForPrompt(process, chunk =>
      chunk.includes(`What's your Output Directory?`)
    );
    process.stdin.write(`${outputDirectory || ''}\n`);
  } else {
    process.stdin.write('no\n');
  }

  await waitForPrompt(process, chunk => chunk.includes('Linked to'));
}

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

// NOTE: Test order is important here.
// This test MUST run before the tests below for them to work.
test(
  'login',
  async () => {
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

    expect(apiRes.status).toBe(200);

    const apiJson = await apiRes.json();

    expect(apiJson['MY_NEW_ENV_VAR']).toBe('my plaintext value');
    expect(apiJson['MY_DECRYPTABLE_SECRET_ENV']).toBe('decryptable value');

    const homeUrl = localhost[0];

    const homeRes = await fetch(homeUrl);
    const homeJson = await homeRes.json();
    expect(homeJson['MY_NEW_ENV_VAR']).toBe('my plaintext value');
    expect(homeJson['MY_DECRYPTABLE_SECRET_ENV']).toBe('decryptable value');

    vc.kill('SIGTERM', { forceKillAfterTimeout: 2000 });

    const { exitCode, stdout, stderr } = await vc;
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
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

    vc.kill('SIGTERM', { forceKillAfterTimeout: 2000 });

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

    vc.kill('SIGTERM', { forceKillAfterTimeout: 2000 });

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

  function vcEnvRemoveByName(name) {
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
  tmpDir = tmp.dirSync({ unsafeCleanup: true });
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
  tmpDir = tmp.dirSync({ unsafeCleanup: true });
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
  tmpDir = tmp.dirSync({ unsafeCleanup: true });
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
  tmpDir = tmp.dirSync({ unsafeCleanup: true });
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
  tmpDir = tmp.dirSync({ unsafeCleanup: true });
  const cwd = tmpDir.name;
  const goal =
    'Error: No example found for noce, run `vercel init` to see the list of available examples.';

  const { stdout, stderr, exitCode } = await execute(['init', 'noce'], { cwd });

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(stderr).toContain(goal);
});

test('try to initialize example "example-404"', async () => {
  tmpDir = tmp.dirSync({ unsafeCleanup: true });
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
    fs.readFileSync(path.join(firstDeployment, 'now.json'))
  );
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
        2,
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
  const check = async (...args) => {
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
  const data = JSON.parse(text);

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
  expect(output.stdout).toMatch(new RegExp());
});

test('vercel secret ls --test-warning', async () => {
  const output = await execute(['secret', 'ls', '--test-warning']);

  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toMatch(/Test warning message./gm);
  expect(output.stderr).toMatch(/Learn more: https:\/\/vercel.com/gm);
  expect(output.stdout).toMatch(/No secrets found under/gm);
});

test('vercel secret rename', async () => {
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

test(
  'change user',
  async () => {
    const { stdout: prevUser } = await execute(['whoami']);

    // Delete the current token
    await execute(['logout', '--debug'], { stdio: 'inherit' });

    await createUser();

    await execute(['login', email, '--api', loginApiUrl, '--debug'], {
      stdio: 'inherit',
      env: {
        FORCE_TTY: '1',
      },
    });

    const auth = await fs.readJSON(getConfigAuthPath());
    expect(auth.token).toBe(token);

    const { stdout: nextUser } = await execute(['whoami']);

    expect(typeof prevUser, prevUser).toBe('string');
    expect(typeof nextUser, nextUser).toBe('string');
    expect(prevUser).not.toBe(nextUser);
  },
  60 * 1000
);

test('assign a domain to a project', async () => {
  const domain = `project-domain.${contextName}.vercel.app`;
  const directory = fixture('static-deployment');

  const deploymentOutput = await execute([directory, '--public', '--yes']);
  expect(deploymentOutput.exitCode, formatOutput(deploymentOutput)).toBe(0);

  const host = deploymentOutput.stdout.trim().replace('https://', '');
  const deployment = await apiFetch(
    `/v10/now/deployments/unknown?url=${host}`
  ).then(resp => resp.json());

  expect(typeof deployment.name).toBe('string');
  const project = deployment.name;

  const output = await execute(['domains', 'add', domain, project, '--force']);
  expect(output.exitCode, formatOutput(output)).toBe(0);

  const removeResponse = await execute(['rm', project, '-y']);
  expect(removeResponse.exitCode, formatOutput(removeResponse)).toBe(0);
});

test('ensure `github` and `scope` are not sent to the API', async () => {
  const directory = fixture('github-and-scope-config');
  const output = await execute([directory, '--yes']);

  expect(output.exitCode, formatOutput(output)).toBe(0);
});

test('should show prompts to set up project during first deploy', async () => {
  const dir = fixture('project-link-deploy');
  const projectName = `project-link-deploy-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const now = execa(binaryPath, [dir, ...defaultArgs]);

  await setupProject(now, projectName, {
    buildCommand: `mkdir -p o && echo '<h1>custom hello</h1>' > o/index.html`,
    outputDirectory: 'o',
  });

  const output = await now;

  // Ensure the exit code is right
  expect(output.exitCode, formatOutput(output)).toBe(0);

  // Ensure .gitignore is created
  const gitignore = await readFile(path.join(dir, '.gitignore'), 'utf8');
  expect(gitignore).toBe('.vercel\n');

  // Ensure .vercel/project.json and .vercel/README.txt are created
  expect(
    fs.existsSync(path.join(dir, '.vercel', 'project.json')),
    'project.json'
  ).toBe(true);
  expect(
    fs.existsSync(path.join(dir, '.vercel', 'README.txt')),
    'README.txt'
  ).toBe(true);

  // Send a test request to the deployment
  const response = await fetch(new URL(output.stdout));
  const text = await response.text();
  expect(text).toContain('<h1>custom hello</h1>');

  // Ensure that `vc dev` also uses the configured build command
  // and output directory
  let stderr = '';
  const port = 58351;
  const dev = execa(binaryPath, ['dev', '--listen', port, dir, ...defaultArgs]);
  dev.stderr.setEncoding('utf8');

  try {
    dev.stdout.pipe(process.stdout);
    dev.stderr.pipe(process.stderr);
    await new Promise((resolve, reject) => {
      dev.once('close', (code, signal) => {
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
    expect(text2).toContain('<h1>custom hello</h1>');
  } finally {
    process.kill(dev.pid, 'SIGTERM');
  }
});

test('should prefill "project name" prompt with folder name', async () => {
  const projectName = `static-deployment-${
    Math.random().toString(36).split('.')[1]
  }`;

  const src = fixture('static-deployment');

  // remove previously linked project if it exists
  await remove(path.join(src, '.vercel'));

  const directory = path.join(src, '../', projectName);
  await copy(src, directory);

  const now = execa(binaryPath, [directory, ...defaultArgs], {
    env: {
      FORCE_TTY: '1',
    },
  });

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
    chunk.includes('Want to modify these settings?')
  );
  now.stdin.write('no\n');

  const output = await now;
  expect(output.exitCode, formatOutput(output)).toBe(0);
});

test('should prefill "project name" prompt with --name', async () => {
  const directory = fixture('static-deployment');
  const projectName = `static-deployment-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(directory, '.vercel'));

  const now = execa(
    binaryPath,
    [directory, '--name', projectName, ...defaultArgs],
    {
      env: {
        FORCE_TTY: '1',
      },
    }
  );

  let isDeprecated = false;

  await waitForPrompt(now, chunk => {
    if (chunk.includes('The "--name" option is deprecated')) {
      isDeprecated = true;
    }

    return /Set up and deploy [^?]+\?/.test(chunk);
  });
  now.stdin.write('yes\n');

  expect(isDeprecated, 'isDeprecated').toBe(true);

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
    chunk.includes('Want to modify these settings?')
  );
  now.stdin.write('no\n');

  const output = await now;
  expect(output.exitCode, formatOutput(output)).toBe(0);
});

test('should prefill "project name" prompt with now.json `name`', async () => {
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

  const now = execa(binaryPath, [directory, ...defaultArgs], {
    env: {
      FORCE_TTY: '1',
    },
  });

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
    chunk.includes('Want to modify these settings?')
  );
  now.stdin.write('no\n');

  const output = await now;
  expect(output.exitCode, formatOutput(output)).toBe(0);

  expect(isDeprecated, 'isDeprecated').toBe(true);

  // clean up
  await remove(path.join(directory, 'vercel.json'));
});

test('deploy with unknown `VERCEL_PROJECT_ID` should fail', async () => {
  const directory = fixture('static-deployment');
  const user = await fetchTokenInformation(token);

  const output = await execute([directory], {
    env: {
      VERCEL_ORG_ID: user.id,
      VERCEL_PROJECT_ID: 'asdf',
    },
  });

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toContain('Project not found');
});

test('deploy with `VERCEL_ORG_ID` but without `VERCEL_PROJECT_ID` should fail', async () => {
  const directory = fixture('static-deployment');
  const user = await fetchTokenInformation(token);

  const output = await execute([directory], {
    env: { VERCEL_ORG_ID: user.id },
  });

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toContain(
    'You specified `VERCEL_ORG_ID` but you forgot to specify `VERCEL_PROJECT_ID`. You need to specify both to deploy to a custom project.'
  );
});

test('deploy with `VERCEL_PROJECT_ID` but without `VERCEL_ORG_ID` should fail', async () => {
  const directory = fixture('static-deployment');

  const output = await execute([directory], {
    env: { VERCEL_PROJECT_ID: 'asdf' },
  });

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toContain(
    'You specified `VERCEL_PROJECT_ID` but you forgot to specify `VERCEL_ORG_ID`. You need to specify both to deploy to a custom project.'
  );
});

test('deploy with `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`', async () => {
  const directory = fixture('static-deployment');

  // generate `.vercel`
  await execute([directory, '--yes']);

  const link = require(path.join(directory, '.vercel/project.json'));
  await remove(path.join(directory, '.vercel'));

  const output = await execute([directory], {
    env: {
      VERCEL_ORG_ID: link.orgId,
      VERCEL_PROJECT_ID: link.projectId,
    },
  });

  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stdout).not.toContain('Linked to');
});

test('deploy shows notice when project in `.vercel` does not exists', async () => {
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

  expect(detectedNotice, 'detectedNotice').toBe(true);
});

test('use `rootDirectory` from project when deploying', async () => {
  const directory = fixture('project-root-directory');

  const firstResult = await execute([directory, '--yes', '--public']);
  expect(firstResult.exitCode, formatOutput(firstResult)).toBe(0);

  const { host: firstHost } = new URL(firstResult.stdout);
  const response = await apiFetch(`/v12/now/deployments/get?url=${firstHost}`);
  expect(response.status).toBe(200);
  const { projectId } = await response.json();
  expect(typeof projectId).toBe('string');

  const projectResponse = await apiFetch(`/v2/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      rootDirectory: 'src',
    }),
  });

  expect(projectResponse.status, await projectResponse.text()).toBe(200);

  const secondResult = await execute([directory, '--public']);
  expect(secondResult.exitCode, formatOutput(secondResult)).toBe(0);

  const pageResponse1 = await fetch(secondResult.stdout);
  expect(pageResponse1.status).toBe(200);
  expect(await pageResponse1.text()).toMatch(/I am a website/gm);

  // Ensures that the `now.json` file has been applied
  const pageResponse2 = await fetch(`${secondResult.stdout}/i-do-exist`);
  expect(pageResponse2.status).toBe(200);
  expect(await pageResponse2.text()).toMatch(/I am a website/gm);

  await apiFetch(`/v2/projects/${projectId}`, {
    method: 'DELETE',
  });
});

test('vercel deploy with unknown `VERCEL_ORG_ID` or `VERCEL_PROJECT_ID` should error', async () => {
  const output = await execute(['deploy'], {
    env: { VERCEL_ORG_ID: 'asdf', VERCEL_PROJECT_ID: 'asdf' },
  });

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toContain('Project not found');
});

test('vercel env with unknown `VERCEL_ORG_ID` or `VERCEL_PROJECT_ID` should error', async () => {
  const output = await execute(['env'], {
    env: { VERCEL_ORG_ID: 'asdf', VERCEL_PROJECT_ID: 'asdf' },
  });

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toContain('Project not found');
});

test('whoami with `VERCEL_ORG_ID` should favor `--scope` and should error', async () => {
  const user = await fetchTokenInformation(token);

  const output = await execute(['whoami', '--scope', 'asdf'], {
    env: { VERCEL_ORG_ID: user.id },
  });

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toContain('The specified scope does not exist');
});

test('whoami with local .vercel scope', async () => {
  const directory = fixture('static-deployment');
  const user = await fetchTokenInformation(token);

  // create local .vercel
  await ensureDir(path.join(directory, '.vercel'));
  await fs.writeFile(
    path.join(directory, '.vercel', 'project.json'),
    JSON.stringify({ orgId: user.id, projectId: 'xxx' })
  );

  const output = await execute(['whoami'], {
    cwd: directory,
  });

  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stdout).toContain(contextName);

  // clean up
  await remove(path.join(directory, '.vercel'));
});

test('deploys with only now.json and README.md', async () => {
  const directory = fixture('deploy-with-only-readme-now-json');

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    [...defaultArgs, '--yes'],
    {
      cwd: directory,
      reject: false,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  const { host } = new URL(stdout);
  const res = await fetch(`https://${host}/README.md`);
  const text = await res.text();
  expect(text).toMatch(/readme contents/);
});

test('deploys with only vercel.json and README.md', async () => {
  const directory = fixture('deploy-with-only-readme-vercel-json');

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    [...defaultArgs, '--yes'],
    {
      cwd: directory,
      reject: false,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  const { host } = new URL(stdout);
  const res = await fetch(`https://${host}/README.md`);
  const text = await res.text();
  expect(text).toMatch(/readme contents/);
});

test('reject conflicting `vercel.json` and `now.json` files', async () => {
  const directory = fixture('conflicting-now-json-vercel-json');

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    [...defaultArgs, '--yes'],
    {
      cwd: directory,
      reject: false,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(stderr).toContain(
    'Cannot use both a `vercel.json` and `now.json` file. Please delete the `now.json` file.'
  );
});

test('`vc --debug project ls` should output the projects listing', async () => {
  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    [...defaultArgs, '--debug', 'project', 'ls'],
    {
      reject: false,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  expect(stderr).toContain('> Projects found under');
});

test(
  'deploy gatsby twice and print cached directories',
  async () => {
    const directory = example('gatsby');
    const packageJsonPath = path.join(directory, 'package.json');
    const packageJsonOriginal = await readFile(packageJsonPath, 'utf8');
    const pkg = JSON.parse(packageJsonOriginal);

    async function tryDeploy(cwd) {
      const { exitCode, stdout, stderr } = await execa(
        binaryPath,
        [...defaultArgs, '--public', '--yes'],
        {
          cwd,
          stdio: 'inherit',
          reject: false,
        }
      );

      expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
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
  },
  6 * 60 * 1000
);

test('deploy pnpm twice using pnp and symlink=false', async () => {
  const directory = path.join(__dirname, 'fixtures/unit/pnpm-pnp-symlink');

  await remove(path.join(directory, '.vercel'));

  function deploy() {
    return execa(binaryPath, [
      directory,
      '--name',
      session,
      ...defaultArgs,
      '--public',
      '--yes',
    ]);
  }

  let { exitCode, stdout, stderr } = await deploy();
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  let page = await fetch(stdout);
  let text = await page.text();
  expect(text).toBe('no cache\n');

  ({ exitCode, stdout, stderr } = await deploy());
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  page = await fetch(stdout);
  text = await page.text();

  expect(text).toBe('cache exists\n');
});

test('reject deploying with wrong team .vercel config', async () => {
  const directory = fixture('unauthorized-vercel-config');

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    [...defaultArgs, '--yes'],
    {
      cwd: directory,
      reject: false,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(stderr).toContain(
    'Could not retrieve Project Settings. To link your Project, remove the `.vercel` directory and deploy again.'
  );
});

test('reject deploying with invalid token', async () => {
  const directory = fixture('unauthorized-vercel-config');
  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    [...defaultArgs, '--yes'],
    {
      cwd: directory,
      reject: false,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(stderr).toMatch(
    /Error: Could not retrieve Project Settings\. To link your Project, remove the `\.vercel` directory and deploy again\./g
  );
});

test('[vc link] should show prompts to set up project', async () => {
  const dir = fixture('project-link-zeroconf');
  const projectName = `project-link-zeroconf-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const vc = execa(binaryPath, ['link', ...defaultArgs], {
    cwd: dir,
    env: {
      FORCE_TTY: '1',
    },
  });

  await setupProject(vc, projectName, {
    buildCommand: `mkdir -p o && echo '<h1>custom hello</h1>' > o/index.html`,
    outputDirectory: 'o',
  });

  const output = await vc;

  // Ensure the exit code is right
  expect(output.exitCode, formatOutput(output)).toBe(0);

  // Ensure .gitignore is created
  const gitignore = await readFile(path.join(dir, '.gitignore'), 'utf8');
  expect(gitignore).toBe('.vercel\n');

  // Ensure .vercel/project.json and .vercel/README.txt are created
  expect(
    fs.existsSync(path.join(dir, '.vercel', 'project.json')),
    'project.json'
  ).toBe(true);
  expect(
    fs.existsSync(path.join(dir, '.vercel', 'README.txt')),
    'README.txt'
  ).toBe(true);
});

test('[vc link --yes] should not show prompts and autolink', async () => {
  const dir = fixture('project-link-confirm');

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    ['link', '--yes', ...defaultArgs],
    { cwd: dir, reject: false }
  );

  // Ensure the exit code is right
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  // Ensure the message is correct pattern
  expect(stderr).toMatch(/Linked to /m);

  // Ensure .gitignore is created
  const gitignore = await readFile(path.join(dir, '.gitignore'), 'utf8');
  expect(gitignore).toBe('.vercel\n');

  // Ensure .vercel/project.json and .vercel/README.txt are created
  expect(
    fs.existsSync(path.join(dir, '.vercel', 'project.json')),
    'project.json'
  ).toBe(true);
  expect(
    fs.existsSync(path.join(dir, '.vercel', 'README.txt')),
    'README.txt'
  ).toBe(true);
});

test('[vc link] should not duplicate paths in .gitignore', async () => {
  const dir = fixture('project-link-gitignore');

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    ['link', '--yes', ...defaultArgs],
    {
      cwd: dir,
      reject: false,
      env: {
        FORCE_TTY: '1',
      },
    }
  );

  // Ensure the exit code is right
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  // Ensure the message is correct pattern
  expect(stderr).toMatch(/Linked to /m);

  // Ensure .gitignore is created
  const gitignore = await readFile(path.join(dir, '.gitignore'), 'utf8');
  expect(gitignore).toBe('.vercel\n');
});

test('[vc dev] should show prompts to set up project', async () => {
  const dir = fixture('project-link-dev');
  const port = 58352;
  const projectName = `project-link-dev-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const dev = execa(binaryPath, ['dev', '--listen', port, ...defaultArgs], {
    cwd: dir,
    env: {
      FORCE_TTY: '1',
    },
  });

  await setupProject(dev, projectName, {
    buildCommand: `mkdir -p o && echo '<h1>custom hello</h1>' > o/index.html`,
    outputDirectory: 'o',
  });

  // Ensure .gitignore is created
  const gitignore = await readFile(path.join(dir, '.gitignore'), 'utf8');
  expect(gitignore).toBe('.vercel\n');

  // Ensure .vercel/project.json and .vercel/README.txt are created
  expect(
    fs.existsSync(path.join(dir, '.vercel', 'project.json')),
    'project.json'
  ).toBe(true);
  expect(
    fs.existsSync(path.join(dir, '.vercel', 'README.txt')),
    'README.txt'
  ).toBe(true);

  await waitForPrompt(dev, chunk => chunk.includes('Ready! Available at'));

  // Ensure that `vc dev` also works
  try {
    const response = await fetch(`http://localhost:${port}/`);
    const text = await response.text();
    expect(text).toContain('<h1>custom hello</h1>');
  } finally {
    process.kill(dev.pid, 'SIGTERM');
  }
});

test('[vc link] should show project prompts but not framework when `builds` defined', async () => {
  const dir = fixture('project-link-legacy');
  const projectName = `project-link-legacy-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const vc = execa(binaryPath, ['link', ...defaultArgs], {
    cwd: dir,
    env: {
      FORCE_TTY: '1',
    },
  });

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
  expect(output.exitCode, formatOutput(output)).toBe(0);

  // Ensure .gitignore is created
  const gitignore = await readFile(path.join(dir, '.gitignore'), 'utf8');
  expect(gitignore).toBe('.vercel\n');

  // Ensure .vercel/project.json and .vercel/README.txt are created
  expect(
    fs.existsSync(path.join(dir, '.vercel', 'project.json')),
    'project.json'
  ).toBe(true);
  expect(
    fs.existsSync(path.join(dir, '.vercel', 'README.txt')),
    'README.txt'
  ).toBe(true);
});

test('[vc dev] should send the platform proxy request headers to frontend dev server ', async () => {
  const dir = fixture('dev-proxy-headers-and-env');
  const port = 58353;
  const projectName = `dev-proxy-headers-and-env-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const dev = execa(binaryPath, ['dev', '--listen', port, ...defaultArgs], {
    cwd: dir,
    env: {
      FORCE_TTY: '1',
    },
  });

  await setupProject(dev, projectName, {
    buildCommand: `mkdir -p o && echo '<h1>custom hello</h1>' > o/index.html`,
    outputDirectory: 'o',
    devCommand: 'node server.js',
  });

  await waitForPrompt(dev, chunk => chunk.includes('Ready! Available at'));

  // Ensure that `vc dev` also works
  try {
    const response = await fetch(`http://localhost:${port}/`);
    const body = await response.json();
    expect(body.headers['x-vercel-deployment-url']).toBe(`localhost:${port}`);
    expect(body.env.NOW_REGION).toBe('dev1');
  } finally {
    process.kill(dev.pid, 'SIGTERM');
  }
});

test('[vc link] should support the `--project` flag', async () => {
  const projectName = 'link-project-flag';
  const directory = fixture('static-deployment');

  const [user, output] = await Promise.all([
    fetchTokenInformation(token),
    execute(['link', '--yes', '--project', projectName, directory]),
  ]);

  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toContain(`Linked to ${user.username}/${projectName}`);
});

test('[vc build] should build project with `@vercel/static-build`', async () => {
  const directory = fixture('vc-build-static-build');
  const output = await execute(['build'], { cwd: directory });
  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toContain('Build Completed in .vercel/output');

  expect(
    await fs.readFile(
      path.join(directory, '.vercel/output/static/index.txt'),
      'utf8'
    )
  ).toBe('hi\n');

  const config = await fs.readJSON(
    path.join(directory, '.vercel/output/config.json')
  );
  expect(config.version).toBe(3);

  const builds = await fs.readJSON(
    path.join(directory, '.vercel/output/builds.json')
  );
  expect(builds.target).toBe('preview');
  expect(builds.builds[0].src).toBe('package.json');
  expect(builds.builds[0].use).toBe('@vercel/static-build');
});

test('[vc build] should not include .vercel when distDir is "."', async () => {
  const directory = fixture('static-build-dist-dir');
  const output = await execute(['build'], { cwd: directory });
  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toContain('Build Completed in .vercel/output');
  const dir = await fs.readdir(path.join(directory, '.vercel/output/static'));
  expect(dir).not.toContain('.vercel');
  expect(dir).toContain('index.txt');
});

test('[vc build] should not include .vercel when zeroConfig is true and outputDirectory is "."', async () => {
  const directory = fixture('static-build-zero-config-output-directory');
  const output = await execute(['build'], { cwd: directory });
  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toContain('Build Completed in .vercel/output');
  const dir = await fs.readdir(path.join(directory, '.vercel/output/static'));
  expect(dir).not.toContain('.vercel');
  expect(dir).toContain('index.txt');
});

test('vercel.json configuration overrides in a new project prompt user and merges settings correctly', async () => {
  const directory = fixture(
    'vercel-json-configuration-overrides-merging-prompts'
  );

  // remove previously linked project if it exists
  await remove(path.join(directory, '.vercel'));

  const vc = execa(binaryPath, [directory, ...defaultArgs], { reject: false });

  await waitForPrompt(vc, chunk => chunk.includes('Set up and deploy'));
  vc.stdin.write('y\n');
  await waitForPrompt(vc, chunk =>
    chunk.includes('Which scope do you want to deploy to?')
  );
  vc.stdin.write('\n');
  await waitForPrompt(vc, chunk => chunk.includes('Link to existing project?'));
  vc.stdin.write('n\n');
  await waitForPrompt(vc, chunk =>
    chunk.includes('What’s your project’s name?')
  );
  vc.stdin.write('\n');
  await waitForPrompt(vc, chunk =>
    chunk.includes('In which directory is your code located?')
  );
  vc.stdin.write('\n');
  await waitForPrompt(vc, chunk =>
    chunk.includes('Want to modify these settings?')
  );
  vc.stdin.write('y\n');
  await waitForPrompt(vc, chunk =>
    chunk.includes(
      'Which settings would you like to overwrite (select multiple)?'
    )
  );
  vc.stdin.write('a\n');
  await waitForPrompt(vc, chunk =>
    chunk.includes("What's your Development Command?")
  );
  vc.stdin.write('echo "DEV COMMAND"\n');
  // the crux of this test is to make sure that the outputDirectory is properly set by the prompts.
  // otherwise the output from the build command will not be the index route and the page text assertion below will fail.
  await waitForPrompt(vc, chunk =>
    chunk.includes("What's your Output Directory?")
  );
  vc.stdin.write('output\n');
  await waitForPrompt(vc, chunk => chunk.includes('Linked to'));
  const deployment = await vc;
  expect(deployment.exitCode, formatOutput(deployment)).toBe(0);
  // assert the command were executed
  let page = await fetch(deployment.stdout);
  let text = await page.text();
  expect(text).toBe('1\n');
});

test('vercel.json configuration overrides in an existing project do not prompt user and correctly apply overrides', async () => {
  // create project directory and get path to vercel.json
  const directory = fixture('vercel-json-configuration-overrides');
  const vercelJsonPath = path.join(directory, 'vercel.json');

  async function deploy(autoConfirm = false) {
    const deployment = await execa(
      binaryPath,
      [directory, ...defaultArgs, '--public'].concat(
        autoConfirm ? ['--yes'] : []
      ),
      { reject: false }
    );
    expect(deployment.exitCode, formatOutput(deployment)).toBe(0);
    return deployment;
  }

  // Step 1. Create a simple static deployment with no configuration.
  // Deployment should succeed and page should display "0"

  await mkdir(path.join(directory, 'public'));
  await writeFile(path.join(directory, 'public/index.txt'), '0');

  // auto-confirm this deployment
  let deployment = await deploy(true);

  let page = await fetch(deployment.stdout);
  let text = await page.text();
  expect(text).toBe('0');

  // Step 2. Now that the project exists, override the buildCommand and outputDirectory.
  // The CLI should not prompt the user about the overrides.

  const BUILD_COMMAND = 'mkdir output && echo "1" >> output/index.txt';
  const OUTPUT_DIRECTORY = 'output';

  await writeFile(
    vercelJsonPath,
    JSON.stringify({
      buildCommand: BUILD_COMMAND,
      outputDirectory: OUTPUT_DIRECTORY,
    })
  );

  deployment = await deploy();
  page = await fetch(deployment.stdout);
  text = await page.text();
  expect(text).toBe('1\n');

  // // Step 3. Do a more complex deployment using a framework this time
  await mkdir(`${directory}/pages`);
  await writeFile(
    `${directory}/pages/index.js`,
    `export default () => 'Next.js Test'`
  );
  await writeFile(
    vercelJsonPath,
    JSON.stringify({
      framework: 'nextjs',
    })
  );
  await writeFile(
    `${directory}/package.json`,
    JSON.stringify({
      scripts: {
        dev: 'next',
        start: 'next start',
        build: 'next build',
      },
      dependencies: {
        next: 'latest',
        react: 'latest',
        'react-dom': 'latest',
      },
    })
  );

  deployment = await deploy();
  page = await fetch(deployment.stdout);
  text = await page.text();
  expect(text).toMatch(/Next\.js Test/);
});
