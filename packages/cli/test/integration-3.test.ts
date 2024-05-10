import ms from 'ms';
import path from 'path';
import { once } from 'node:events';
import { URL, parse as parseUrl } from 'url';
import semVer from 'semver';
import { Readable } from 'stream';
import { homedir } from 'os';
import { runNpmInstall } from '@vercel/build-utils';
import { execCli } from './helpers/exec';
import fetch, { RequestInit, RequestInfo } from 'node-fetch';
import retry from 'async-retry';
import fs from 'fs-extra';
import { logo } from '../src/util/pkg-name';
import sleep from '../src/util/sleep';
import humanizePath from '../src/util/humanize-path';
import pkg from '../package.json';
import { fetchTokenWithRetry } from '../../../test/lib/deployment/now-deploy';
import waitForPrompt from './helpers/wait-for-prompt';
import { getNewTmpDir, listTmpDirs } from './helpers/get-tmp-dir';
import getGlobalDir from './helpers/get-global-dir';
import {
  setupE2EFixture,
  prepareE2EFixtures,
} from './helpers/setup-e2e-fixture';
import formatOutput from './helpers/format-output';
import type http from 'http';
import type { NowJson, DeploymentLike } from './helpers/types';

const TEST_TIMEOUT = 3 * 60 * 1000;
jest.setTimeout(TEST_TIMEOUT);

const binaryPath = path.resolve(__dirname, `../scripts/start.js`);

const deployHelpMessage = `${logo} vercel [options] <command | path>`;
let session = 'temp-session';
let secretName: string | undefined;

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

const context: {
  deployment: string | undefined;
} = {
  deployment: undefined,
};

let token: string | undefined;
let email: string | undefined;
let contextName: string | undefined;

function mockLoginApi(req: http.IncomingMessage, res: http.ServerResponse) {
  const { url = '/', method } = req;
  let { pathname = '/', query = {} } = parseUrl(url, true);
  // eslint-disable-next-line no-console
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

const pickUrl = (stdout: string) => {
  const lines = stdout.split('\n');
  return lines[lines.length - 1];
};

const waitForDeployment = async (href: RequestInfo) => {
  // eslint-disable-next-line no-console
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

let loginApiUrl = '';
const loginApiServer = require('http')
  .createServer(mockLoginApi)
  .listen(0, () => {
    const { port } = loginApiServer.address();
    loginApiUrl = `http://localhost:${port}`;
    // eslint-disable-next-line no-console
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
      session = Math.random().toString(36).split('.')[1];
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
    // eslint-disable-next-line no-console
    console.log('Failed test suite `beforeAll`');
    // eslint-disable-next-line no-console
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
    // eslint-disable-next-line no-console
    console.log('Removing temp dir: ', tmpDir.name);
    tmpDir.removeCallback();
  }
});

async function clearAuthConfig() {
  const configPath = getConfigAuthPath();
  if (fs.existsSync(configPath)) {
    await fs.writeFile(configPath, JSON.stringify({}));
  }
}

test('[vc projects] should create a project successfully', async () => {
  const projectName = `vc-projects-add-${
    Math.random().toString(36).split('.')[1]
  }`;

  const vc = execCli(binaryPath, ['project', 'add', projectName]);

  await waitForPrompt(vc, `Success! Project ${projectName} added`);

  const { exitCode, stdout, stderr } = await vc;
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  // creating the same project again should succeed
  const vc2 = execCli(binaryPath, ['project', 'add', projectName]);

  await waitForPrompt(vc2, `Success! Project ${projectName} added`);

  const { exitCode: exitCode2 } = await vc;
  expect(exitCode2).toBe(0);
});

test('deploy with metadata containing "=" in the value', async () => {
  const target = await setupE2EFixture('static-v2-meta');

  const { exitCode, stdout, stderr } = await execCli(binaryPath, [
    target,
    '--yes',
    '--meta',
    'someKey==',
  ]);

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
  const { stderr, stdout, exitCode } = await execCli(binaryPath, ['help']);

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(2);
  expect(stderr).toContain(deployHelpMessage);
  expect(stderr).not.toContain('ExperimentalWarning');
});

test('output the version', async () => {
  const { stdout, stderr, exitCode } = await execCli(binaryPath, ['--version']);

  const version = stdout.trim();

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  expect(semVer.valid(version)).toBeTruthy();
  expect(version).toBe(pkg.version);
});

test('should add secret with hyphen prefix', async () => {
  const target = await setupE2EFixture('build-secret');
  const key = 'mysecret';
  const value = '-foo_bar';

  let secretCall = await execCli(
    binaryPath,
    ['secrets', 'add', '--', key, value],
    {
      cwd: target,
    }
  );

  expect(secretCall.exitCode, formatOutput(secretCall)).toBe(0);

  let targetCall = await execCli(binaryPath, ['--yes'], {
    cwd: target,
  });

  expect(targetCall.exitCode, formatOutput(targetCall)).toBe(0);
  const { host } = new URL(targetCall.stdout);
  const response = await fetch(`https://${host}`);
  expect(response.status).toBe(200);
  expect(await response.text()).toBe(`${value}\n`);
});

test('login with unregistered user', async () => {
  const { stdout, stderr, exitCode } = await execCli(binaryPath, [
    'login',
    `${session}@${session}.com`,
  ]);

  const goal = `Error: Please sign up: https://vercel.com/signup`;
  const lines = stderr.trim().split('\n');
  const last = lines[lines.length - 1];

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(last).toContain(goal);
});

test('ignore files specified in .nowignore', async () => {
  const directory = await setupE2EFixture('nowignore');

  const args = ['--debug', '--public', '--name', session, '--yes'];
  const targetCall = await execCli(binaryPath, args, {
    cwd: directory,
  });

  const { host } = new URL(targetCall.stdout);
  const ignoredFile = await fetch(`https://${host}/ignored.txt`);
  expect(ignoredFile.status).toBe(404);

  const presentFile = await fetch(`https://${host}/index.txt`);
  expect(presentFile.status).toBe(200);
});

test('ignore files specified in .nowignore via allowlist', async () => {
  const directory = await setupE2EFixture('nowignore-allowlist');

  const args = ['--debug', '--public', '--name', session, '--yes'];
  const targetCall = await execCli(binaryPath, args, {
    cwd: directory,
  });

  const { host } = new URL(targetCall.stdout);
  const ignoredFile = await fetch(`https://${host}/ignored.txt`);
  expect(ignoredFile.status).toBe(404);

  const presentFile = await fetch(`https://${host}/index.txt`);
  expect(presentFile.status).toBe(200);
});

test('list the scopes', async () => {
  const { stdout, stderr, exitCode } = await execCli(binaryPath, [
    'teams',
    'ls',
  ]);

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  const include = new RegExp(`✔ ${contextName}\\s+${email}`);
  expect(stderr).toMatch(include);
});

test('domains inspect', async () => {
  const domainName = `inspect-${contextName}-${Math.random()
    .toString()
    .slice(2, 8)}.org`;

  const directory = await setupE2EFixture('static-multiple-files');
  const projectName = Math.random().toString().slice(2);

  const output = await execCli(binaryPath, [
    directory,
    `--name=${projectName}`,
    '--yes',
    '--public',
  ]);

  expect(output.exitCode, formatOutput(output)).toBe(0);

  {
    // Add a domain that can be inspected
    const result = await execCli(binaryPath, [
      `domains`,
      `add`,
      domainName,
      projectName,
    ]);

    expect(result.exitCode, formatOutput(result)).toBe(0);
  }

  const { exitCode, stdout, stderr } = await execCli(binaryPath, [
    'domains',
    'inspect',
    domainName,
  ]);

  expect(stderr).toContain(`Renewal Price`);
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  {
    // Remove the domain again
    const result = await execCli(binaryPath, [`domains`, `rm`, domainName], {
      input: 'y',
    });

    expect(result.exitCode, formatOutput(result)).toBe(0);
  }
});

// eslint-disable-next-line jest/no-disabled-tests
test('try to purchase a domain', async () => {
  if (process.env.VERCEL_TOKEN || process.env.NOW_TOKEN) {
    // eslint-disable-next-line no-console
    console.log(
      'Skipping test `try to purchase a domain` because a personal VERCEL_TOKEN was provided.'
    );
    return;
  }

  const stream = new Readable();
  stream._read = () => {};

  const { stderr, stdout, exitCode } = await execCli(
    binaryPath,
    ['domains', 'buy', `${session}-test.com`],
    {
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
  const { stderr, stdout, exitCode } = await execCli(binaryPath, [
    'domains',
    'transfer-in',
    '--code',
    'xyz',
    `${session}-test.com`,
  ]);

  expect(stderr).toContain(
    `Error: The domain "${session}-test.com" is not transferable.`
  );
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
});

test('try to move an invalid domain', async () => {
  const { stderr, stdout, exitCode } = await execCli(binaryPath, [
    'domains',
    'move',
    `${session}-invalid-test.org`,
    `${session}-invalid-user`,
  ]);

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
  const { stdout, stderr, exitCode } = await execCli(
    binaryPath,
    ['alias', hosts.deployment, hosts.alias],
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
  const { stdout, stderr, exitCode } = await execCli(
    binaryPath,
    ['alias', 'rm', context.wildcardAlias, '--yes'],
  );
  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);
  t.is(exitCode, 0);
  t.true(stdout.startsWith(goal));
});
*/

test('ensure we render a warning for deployments with no files', async () => {
  const directory = await setupE2EFixture('empty-directory');

  const { stderr, stdout, exitCode } = await execCli(binaryPath, [
    directory,
    '--public',
    '--name',
    session,
    '--yes',
    '--force',
  ]);

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

  const { stderr, stdout, exitCode } = await execCli(binaryPath, [
    'logs',
    context.deployment,
  ]);

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

  const { stderr, stdout, exitCode } = await execCli(binaryPath, [
    'logs',
    context.deployment,
    '--output',
    'raw',
  ]);

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

  const { stderr, stdout, exitCode } = await execCli(
    binaryPath,
    [directory, '--public', '--name', session, '--force'],
    {
      input: 'N\n',
    }
  );

  // Ensure the exit code is right
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  expect(stderr).toContain(
    'You are deploying your home directory. Do you want to continue?'
  );
  expect(stderr).toContain('Canceled');
});

test('ensure the `scope` property works with email', async () => {
  const directory = await setupE2EFixture('config-scope-property-email');

  const { stderr, stdout, exitCode } = await execCli(binaryPath, [
    directory,
    '--public',
    '--name',
    session,
    '--force',
    '--yes',
  ]);

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
  const directory = await setupE2EFixture('config-scope-property-username');

  const { stderr, stdout, exitCode } = await execCli(binaryPath, [
    directory,
    '--public',
    '--name',
    session,
    '--force',
    '--yes',
  ]);

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
  const directory = await setupE2EFixture('builds-wrong');

  const { stderr, stdout, exitCode } = await execCli(binaryPath, [
    directory,
    '--public',
    '--yes',
  ]);

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
  const directory = await setupE2EFixture('builds-wrong-vercel');

  const { stderr, stdout, exitCode } = await execCli(binaryPath, [
    directory,
    '--public',
    '--yes',
  ]);

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(stderr).toContain(
    'Error: Invalid vercel.json - should NOT have additional property `fake`. Please remove it.'
  );
  expect(stderr).toContain(
    'https://vercel.com/docs/concepts/projects/project-configuration'
  );
});

test('try to create a builds deployments with wrong `build.env` property', async () => {
  const directory = await setupE2EFixture('builds-wrong-build-env');

  const { exitCode, stdout, stderr } = await execCli(
    binaryPath,
    ['--public', '--yes'],
    {
      cwd: directory,
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
  const directory = await setupE2EFixture('builds-no-list');

  const { exitCode, stdout, stderr } = await execCli(binaryPath, [
    directory,
    '--public',
    '--name',
    session,
    '--force',
    '--yes',
  ]);

  // Ensure the exit code is right
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  // Test if the output is really a URL
  const { host } = new URL(stdout);
  expect(host.split('-')[0]).toBe(session);
});

test('create a staging deployment', async () => {
  const directory = await setupE2EFixture('static-deployment');

  const args = ['--debug', '--public', '--name', session];
  const targetCall = await execCli(binaryPath, [
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
  const directory = await setupE2EFixture('static-deployment');

  const args = ['--debug', '--public', '--name', session];
  const targetCall = await execCli(binaryPath, [
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

  const call = await execCli(binaryPath, [directory, '--prod', ...args]);

  expect(call.exitCode, formatOutput(call)).toBe(0);
  expect(call.stderr).toMatch(/Setting target to production/gm);
  expect(call.stdout).toMatch(/https:\/\//gm);

  const { host } = new URL(call.stdout);
  const deployment = await apiFetch(
    `/v10/now/deployments/unknown?url=${host}`
  ).then(resp => resp.json());
  expect(deployment.target).toBe('production');
});

test('try to deploy non-existing path', async () => {
  const goal = `Error: Could not find “${humanizePath(
    path.join(process.cwd(), session)
  )}”`;

  const { stderr, stdout, exitCode } = await execCli(binaryPath, [
    session,
    '--yes',
  ]);

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(stderr.trim().endsWith(goal), `should end with "${goal}"`).toBe(true);
});

test('try to deploy with non-existing team', async () => {
  const target = await setupE2EFixture('static-deployment');
  const goal = `Error: The specified scope does not exist`;

  const { stderr, stdout, exitCode } = await execCli(binaryPath, [
    target,
    '--scope',
    session,
    '--yes',
  ]);

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(stderr).toContain(goal);
});

test('initialize example "angular"', async () => {
  const cwd = getNewTmpDir();
  const goal = '> Success! Initialized "angular" example in';

  const { exitCode, stdout, stderr } = await execCli(
    binaryPath,
    ['init', 'angular'],
    { cwd }
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

test('fail to add a domain without a project', async () => {
  const output = await execCli(binaryPath, [
    'domains',
    'add',
    'my-domain.vercel.app',
  ]);
  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toMatch(/expects two arguments/gm);
});

test('try to revert a deployment and assign the automatic aliases', async () => {
  const firstDeployment = await setupE2EFixture('now-revert-alias-1');
  const secondDeployment = await setupE2EFixture('now-revert-alias-2');

  const { name } = JSON.parse(
    fs.readFileSync(path.join(firstDeployment, 'now.json')).toString()
  ) as NowJson;
  expect(name).toBeTruthy();

  const url = `https://${name}.user.vercel.app`;

  {
    const { exitCode, stdout, stderr } = await execCli(binaryPath, [
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
    const { exitCode, stdout, stderr } = await execCli(binaryPath, [
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
    const { exitCode, stdout, stderr } = await execCli(binaryPath, [
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
  const { exitCode, stdout, stderr } = await execCli(binaryPath, ['whoami']);

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  expect(stdout).toBe(contextName);
});

test('[vercel dev] fails when dev script calls vercel dev recursively', async () => {
  const deploymentPath = await setupE2EFixture('now-dev-fail-dev-script');
  const { exitCode, stdout, stderr } = await execCli(binaryPath, [
    'dev',
    deploymentPath,
  ]);

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(stderr).toContain('must not recursively invoke itself');
});

test('[vercel dev] fails when development command calls vercel dev recursively', async () => {
  expect.assertions(0);

  const dir = await setupE2EFixture('dev-fail-on-recursion-command');
  const dev = execCli(binaryPath, ['dev', '--yes'], {
    cwd: dir,
  });

  try {
    await waitForPrompt(dev, 'must not recursively invoke itself', 10000);
  } finally {
    const onClose = once(dev, 'close');
    dev.kill();
    await onClose;
  }
});

test('`vercel rm` removes a deployment', async () => {
  const directory = await setupE2EFixture('static-deployment');

  let host;

  {
    const { exitCode, stdout, stderr } = await execCli(binaryPath, [
      directory,
      '--public',
      '--name',
      session,
      '--force',
      '--yes',
    ]);
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
    host = new URL(stdout).host;
  }

  {
    const { exitCode, stdout, stderr } = await execCli(binaryPath, [
      'rm',
      host,
      '--yes',
    ]);

    expect(stderr).toContain(host);
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }
});

test('`vercel rm` should fail with unexpected option', async () => {
  const output = await execCli(binaryPath, [
    'rm',
    'example.example.com',
    '--fake',
  ]);

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toMatch(
    /Error: unknown or unexpected option: --fake/gm
  );
});

test('`vercel rm` 404 exits quickly', async () => {
  const start = Date.now();
  const { exitCode, stderr, stdout } = await execCli(binaryPath, [
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
  const deploymentPath = await setupE2EFixture('failing-build');
  const output = await execCli(binaryPath, [deploymentPath, '--yes']);

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toMatch(/Command "npm run build" exited with 1/gm);
});

test('invalid deployment, projects and alias names', async () => {
  const check = async (...args: string[]) => {
    const output = await execCli(binaryPath, args);
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
  const output = await execCli(binaryPath, ['certs', 'ls']);

  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toMatch(/certificates? found under/gm);
});

test('vercel certs ls --next=123456', async () => {
  const output = await execCli(binaryPath, ['certs', 'ls', '--next=123456']);

  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toMatch(/No certificates found under/gm);
});

test('vercel hasOwnProperty not a valid subcommand', async () => {
  const output = await execCli(binaryPath, ['hasOwnProperty']);

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(
    output.stderr.endsWith(
      `Error: Could not find “${humanizePath(
        path.join(process.cwd(), 'hasOwnProperty')
      )}”`
    )
  ).toEqual(true);
});

test('create zero-config deployment', async () => {
  const fixturePath = await setupE2EFixture('zero-config-next-js');
  const output = await execCli(binaryPath, [
    fixturePath,
    '--force',
    '--public',
    '--yes',
  ]);

  expect(output.exitCode, formatOutput(output)).toBe(0);

  const { host } = new URL(output.stdout);
  const response = await apiFetch(`/v10/now/deployments/unkown?url=${host}`);

  const text = await response.text();

  expect(response.status).toBe(200);
  const data = JSON.parse(text) as DeploymentLike;

  expect(data.error).toBe(undefined);

  const validBuilders = data.builds.every(
    build => !build.use.endsWith('@canary')
  );

  expect(validBuilders).toBe(true);
});

test('next unsupported functions config shows warning link', async () => {
  const fixturePath = await setupE2EFixture(
    'zero-config-next-js-functions-warning'
  );
  const output = await execCli(binaryPath, [
    fixturePath,
    '--force',
    '--public',
    '--yes',
  ]);

  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toMatch(
    /Ignoring function property `runtime`\. When using Next\.js, only `memory` and `maxDuration` can be used\./gm
  );
  expect(output.stderr).toMatch(
    /Learn More: https:\/\/vercel\.link\/functions-property-next/gm
  );
});

test('vercel secret add', async () => {
  secretName = `my-secret-${Date.now().toString(36)}`;
  const value = 'https://my-secret-endpoint.com';

  const output = await execCli(binaryPath, [
    'secret',
    'add',
    secretName,
    value,
  ]);
  expect(output.exitCode, formatOutput(output)).toBe(0);
});

test('vercel secret ls', async () => {
  const output = await execCli(binaryPath, ['secret', 'ls']);
  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toMatch(/Secrets found under/gm);
});

test('vercel secret ls --test-warning', async () => {
  const output = await execCli(binaryPath, ['secret', 'ls', '--test-warning']);
  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toMatch(/Test warning message./gm);
  expect(output.stderr).toMatch(/Learn more: https:\/\/vercel.com/gm);
  expect(output.stderr).toMatch(/No secrets found under/gm);
});

test('vercel secret rename', async () => {
  if (!secretName) {
    throw new Error('Shared state "secretName" not set.');
  }

  const nextName = `renamed-secret-${Date.now().toString(36)}`;
  const output = await execCli(binaryPath, [
    'secret',
    'rename',
    secretName,
    nextName,
  ]);
  expect(output.exitCode, formatOutput(output)).toBe(0);

  secretName = nextName;
});

test('vercel secret rm', async () => {
  if (!secretName) {
    throw new Error('Shared state "secretName" not set.');
  }

  const output = await execCli(binaryPath, ['secret', 'rm', secretName, '-y']);
  expect(output.exitCode, formatOutput(output)).toBe(0);
});

test('deploy a Lambda with 128MB of memory', async () => {
  const directory = await setupE2EFixture('lambda-with-128-memory');
  const output = await execCli(binaryPath, [directory, '--yes']);

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
  const directory = await setupE2EFixture('lambda-with-123-memory');
  const output = await execCli(binaryPath, [directory, '--yes']);

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toMatch(/Serverless Functions.+memory/gm);
  expect(output.stderr).toMatch(/Learn More/gm);
});

test('deploy a Lambda with 3 seconds of maxDuration', async () => {
  const directory = await setupE2EFixture('lambda-with-3-second-timeout');
  const output = await execCli(binaryPath, [directory, '--yes']);

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
  const directory = await setupE2EFixture('lambda-with-1000-second-timeout');
  const output = await execCli(binaryPath, [directory, '--yes']);

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toMatch(
    /maxDuration must be between \d+ second and \d+ seconds/gm
  );
});

test('invalid `--token`', async () => {
  const output = await execCli(binaryPath, ['--token', 'he\nl,o.']);

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toContain(
    'Error: You defined "--token", but its contents are invalid. Must not contain: "\\n", ",", "."'
  );
});

test('deploy a Lambda with a specific runtime', async () => {
  const directory = await setupE2EFixture('lambda-with-php-runtime');
  const output = await execCli(binaryPath, [directory, '--public', '--yes']);

  expect(output.exitCode, formatOutput(output)).toBe(0);

  const url = new URL(output.stdout);
  const res = await fetch(`${url}/api/test`);
  const text = await res.text();
  expect(text).toBe('Hello from PHP');
});

test('fail to deploy a Lambda with a specific runtime but without a locked version', async () => {
  const directory = await setupE2EFixture('lambda-with-invalid-runtime');
  const output = await execCli(binaryPath, [directory, '--yes']);

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toMatch(
    /Function Runtimes must have a valid version/gim
  );
});

test('use build-env', async () => {
  const directory = await setupE2EFixture('build-env');

  const { exitCode, stdout, stderr } = await execCli(binaryPath, [
    directory,
    '--public',
    '--yes',
  ]);

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

test('should invoke CLI extension', async () => {
  const fixture = path.join(__dirname, 'fixtures/e2e/cli-extension');

  // Ensure the `.bin` is populated in the fixture
  await runNpmInstall(fixture);

  const output = await execCli(binaryPath, ['mywhoami'], { cwd: fixture });
  const formatted = formatOutput(output);
  expect(output.stdout, formatted).toContain('Hello from a CLI extension!');
  expect(output.stdout, formatted).toContain('VERCEL_API: http://127.0.0.1:');
  expect(output.stdout, formatted).toContain(`Username: ${contextName}`);
});

// NOTE: Order matters here. This must be the last test in the file.
test('default command should prompt login with empty auth.json', async () => {
  await clearAuthConfig();
  const output = await execCli(binaryPath);
  expect(output.stderr, formatOutput(output)).toBeTruthy();
  expect(output.stderr).toContain(
    'Error: No existing credentials found. Please run `vercel login` or pass "--token"'
  );
});
