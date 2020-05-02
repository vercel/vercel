import ms from 'ms';
import os from 'os';
import path from 'path';
import { URL } from 'url';
import test from 'ava';
import semVer from 'semver';
import { homedir } from 'os';
import execa from 'execa';
import fetch from 'node-fetch';
import tmp from 'tmp-promise';
import retry from 'async-retry';
import fs, { writeFile, readFile } from 'fs-extra';
import logo from '../src/util/output/logo';
import sleep from '../src/util/sleep';
import pkg from '../package';
import parseList from './helpers/parse-list';
import prepareFixtures from './helpers/prepare';

const binaryPath = path.resolve(__dirname, `../scripts/start.js`);
const fixture = name => path.join(__dirname, 'fixtures', 'integration', name);
const deployHelpMessage = `${logo} now [options] <command | path>`;
const session = Math.random()
  .toString(36)
  .split('.')[1];

const isCanary = pkg.version.includes('canary');

const pickUrl = stdout => {
  const lines = stdout.split('\n');
  return lines[lines.length - 1];
};

const createFile = dest => fs.closeSync(fs.openSync(dest, 'w'));
const createDirectory = dest => fs.mkdirSync(dest);
const testv1 = async (...args) => {
  if (!process.version.startsWith('v12.')) {
    // Only run v1 tests on Node 12
    return;
  }
  // eslint-disable-next-line
  await test(...args);
};

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

function fetchTokenWithRetry(url, retries = 3) {
  return retry(
    async () => {
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(
          `Failed to fetch ${url}, received status ${res.status}`
        );
      }

      const data = await res.json();

      return data.token;
    },
    { retries, factor: 1 }
  );
}

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
  return `Received:\n"${stderr}"\n"${stdout}"`;
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

if (!process.env.CI) {
  tmpDir = tmp.dirSync({
    // This ensures the directory gets
    // deleted even if it has contents
    unsafeCleanup: true,
  });

  defaultArgs.push('-Q', path.join(tmpDir.name, '.now'));
}

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

test.before(async () => {
  try {
    await retry(
      async () => {
        const location = path.join(tmpDir ? tmpDir.name : homedir(), '.now');
        const str = 'aHR0cHM6Ly9hcGktdG9rZW4tZmFjdG9yeS56ZWl0LnNo';
        const url = Buffer.from(str, 'base64').toString();
        token = await fetchTokenWithRetry(url);

        if (!fs.existsSync(location)) {
          await createDirectory(location);
        }

        await writeFile(
          path.join(location, `auth.json`),
          JSON.stringify({ token })
        );

        const user = await fetchTokenInformation(token);

        email = user.email;
        contextName = user.email.split('@')[0];
      },
      { retries: 3, factor: 1 }
    );

    await prepareFixtures(contextName);
  } catch (err) {
    console.log('Failed `test.before`');
    console.log(err);
  }
});

test('login', async t => {
  t.timeout(ms('1m'));

  // Delete the current token
  const logoutOutput = await execute(['logout']);
  t.is(logoutOutput.exitCode, 0, formatOutput(logoutOutput));

  const loginOutput = await execa(binaryPath, ['login', email, ...defaultArgs]);

  console.log(loginOutput.stderr);
  console.log(loginOutput.stdout);
  console.log(loginOutput.exitCode);

  t.is(loginOutput.exitCode, 0, formatOutput(loginOutput));
  t.regex(
    loginOutput.stdout,
    /You are now logged in\./gm,
    formatOutput(loginOutput)
  );

  // Save the new token
  const location = path.join(tmpDir ? tmpDir.name : homedir(), '.now');
  const auth = JSON.parse(await readFile(path.join(location, 'auth.json')));

  token = auth.token;

  t.is(typeof token, 'string');
});

test('deploy using --local-config flag v2', async t => {
  const target = fixture('local-config-v2');

  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    ['deploy', '--local-config', 'now-test.json', ...defaultArgs],
    {
      cwd: target,
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 0);

  const { host } = new URL(stdout);

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

testv1('deploy using --local-config flag type cloud v1', async t => {
  const target = fixture('local-config-cloud-v1');

  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    ['deploy', '--public', '--local-config', 'now-test.json', ...defaultArgs],
    {
      cwd: target,
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 0);

  const { host } = new URL(stdout);
  await waitForDeployment(`https://${host}/test.html`);
  await waitForDeployment(`https://${host}/folder/file1.txt`);
  await waitForDeployment(`https://${host}/folder/sub/file2.txt`);

  const testRes = await fetch(`https://${host}/test.html`);
  const testText = await testRes.text();
  t.is(testText, '<h1>hello test</h1>');

  const file1Res = await fetch(`https://${host}/folder/file1.txt`);
  const file1Text = await file1Res.text();
  t.is(file1Text, 'file1');

  const file2Res = await fetch(`https://${host}/folder/sub/file2.txt`);
  const file2Text = await file2Res.text();
  t.is(file2Text, 'file2');

  const mainRes = await fetch(`https://${host}/main.html`);
  t.is(mainRes.status, 404, 'Should not deploy/build main now.json');
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

test('detect update command', async t => {
  {
    const { stderr } = await execute(['update']);
    t.regex(stderr, /yarn add now@/gm, `Received: "${stderr}"`);
  }

  {
    const pkg = require('../package.json');

    const packResult = await execa('npm', ['pack']);
    t.is(packResult.exitCode, 0);

    const prefix = os.tmpdir();
    const binPrefix = path.join(prefix, 'bin');

    process.env.PATH = `${binPrefix}${path.delimeter}${process.env.PATH}`;
    process.env.PREFIX = prefix;
    process.env.npm_config_prefix = prefix;
    process.env.NPM_CONFIG_PREFIX = prefix;

    // Install now to `binPrefix`
    const pkgPath = path.resolve(`now-${pkg.version}.tgz`);

    const installResult = await execa('npm', ['i', '-g', pkgPath], {
      env: process.env,
    });
    t.is(installResult.exitCode, 0);

    const { stdout, stderr, exitCode } = await execa(
      path.join(binPrefix, 'now'),
      ['update'],
      {
        env: process.env,
      }
    );

    console.log(stderr);
    console.log(exitCode);
    console.log(stdout);
    t.regex(stderr, /npm i -g now@/gm, `Received:\n"${stderr}"\n"${stdout}"`);
  }
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

  const goal = `> Error! Please sign up: https://vercel.com/signup`;
  const lines = stdout.trim().split('\n');
  const last = lines[lines.length - 1];

  t.is(exitCode, 1);
  t.is(last, goal);
});

testv1('deploy a v1 node microservice', async t => {
  const target = fixture('node');

  let { stdout, stderr, exitCode } = await execa(
    binaryPath,
    ['--public', '--name', session, ...defaultArgs],
    {
      cwd: target,
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  // Ensure the exit code is right
  t.is(exitCode, 0, formatOutput({ stdout, stderr }));

  // Test if the output is really a URL
  const { href, host } = new URL(stdout);
  t.is(host.split('-')[0], session, formatOutput({ stdout, stderr }));

  await waitForDeployment(href);

  // Send a test request to the deployment
  let response = await fetch(href);
  t.is(response.status, 200);
  const contentType = response.headers.get('content-type');
  const content = await response.json();

  t.is(contentType, 'application/json; charset=utf-8');
  t.is(content.id, contextName);

  // Test that it can be deleted via `now rm`
  ({ stdout, stderr, exitCode } = await execa(
    binaryPath,
    ['rm', '--yes', href, ...defaultArgs],
    {
      reject: false,
    }
  ));

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 0, formatOutput({ stdout, stderr }));

  // Give 2 seconds for the proxy purge to propagate
  await sleep(2000);

  response = await fetch(href);
  t.is(response.status, 404);
});

testv1(
  'deploy a v1 node microservice and infer name from `package.json`',
  async t => {
    const target = fixture('node');

    const { stdout, stderr, exitCode } = await execa(
      binaryPath,
      [target, '--public', ...defaultArgs],
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
    t.true(host.startsWith(`node-test-${contextName}`));
  }
);

testv1('deploy a v1 dockerfile project', async t => {
  const target = fixture('dockerfile');

  // Add the "name" field to the `now.json` file
  const jsonPath = path.join(target, 'now.json');
  const json = JSON.parse(await readFile(jsonPath, 'utf8'));
  json.name = session;
  await writeFile(jsonPath, JSON.stringify(json));

  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    ['--public', '--docker', '--no-verify', ...defaultArgs],
    {
      cwd: target,
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  // Ensure the exit code is right
  t.is(exitCode, 0);

  // Test if the output is really a URL
  const { href, host } = new URL(stdout);
  t.is(host.split('-')[0], session);

  await waitForDeployment(href);

  // Send a test request to the deployment
  const response = await fetch(href);
  t.is(response.status, 200);
  const contentType = response.headers.get('content-type');
  const textContent = await response.text();
  let content;

  try {
    content = JSON.parse(textContent);
  } catch (error) {
    console.log('Error parsing response as JSON:');
    console.error(textContent);
    throw error;
  }

  t.is(contentType, 'application/json; charset=utf-8');
  t.is(content.id, contextName);

  context.deployment = host;
});

test('test invalid json alias rules', async t => {
  const fixturePath = fixture('alias-rules');
  const output = await execute(['alias', '-r', 'invalid-json-rules.json'], {
    cwd: fixturePath,
  });

  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(output.stderr, /Error parsing/, formatOutput(output));
});

test('test invalid alias rules', async t => {
  const fixturePath = fixture('alias-rules');
  const output = await execute(['alias', '-r', 'invalid-rules.json'], {
    cwd: fixturePath,
  });

  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(output.stderr, /Path Alias validation error/, formatOutput(output));
});

test('test invalid type for alias rules', async t => {
  const fixturePath = fixture('alias-rules');
  const output = await execute(['alias', '-r', 'invalid-type-rules.json'], {
    cwd: fixturePath,
  });

  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(output.stderr, /Path Alias validation error/, formatOutput(output));
});

testv1('apply alias rules', async t => {
  const fixturePath = fixture('alias-rules');

  // Create the rules file
  const alias = `test-alias-rules.${contextName}.now.sh`;

  const now = {
    alias: alias,
  };

  const rules = {
    rules: [{ pathname: '/docker-deployment', dest: context.deployment }],
  };

  await writeFile(path.join(fixturePath, 'now.json'), JSON.stringify(now));
  await writeFile(path.join(fixturePath, 'rules.json'), JSON.stringify(rules));

  const output = await execute(['alias', '-r', 'rules.json'], {
    cwd: fixturePath,
  });
  t.is(output.exitCode, 0, formatOutput(output));
});

testv1('find deployment in list', async t => {
  const output = await execa(binaryPath, ['--debug', 'ls', ...defaultArgs], {
    reject: false,
  });

  console.log(output.stderr);
  console.log(output.stdout);
  console.log(output.exitCode);

  const deployments = parseList(output.stdout);

  t.true(deployments.length > 0, formatOutput(output));
  t.is(output.exitCode, 0, formatOutput(output));

  const target = deployments.find(deployment =>
    deployment.includes(`${session}-`)
  );

  t.truthy(target, formatOutput(output));
  t.is(target, context.deployment, formatOutput(output));
});

testv1('find deployment in list with mixed args', async t => {
  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    ['--debug', 'ls', ...defaultArgs],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  const deployments = parseList(stdout);

  t.true(deployments.length > 0);
  t.is(exitCode, 0);

  const target = deployments.find(deployment =>
    deployment.includes(`${session}-`)
  );

  t.truthy(target, formatOutput({ stdout, stderr }));
  t.is(target, context.deployment, formatOutput({ stdout, stderr }));
});

testv1('create an explicit alias for deployment', async t => {
  const hosts = {
    deployment: context.deployment,
    alias: `${session}.now.sh`,
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

  const goal = `> Success! https://${hosts.alias} now points to https://${hosts.deployment}`;

  t.is(exitCode, 0);
  t.true(stdout.startsWith(goal));

  // Send a test request to the alias
  const response = await fetch(`https://${hosts.alias}`);
  const contentType = response.headers.get('content-type');
  const content = await response.json();

  t.is(contentType, 'application/json; charset=utf-8');
  t.is(content.id, contextName);

  context.alias = hosts.alias;
});

testv1('list the aliases', async t => {
  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    ['alias', 'ls', ...defaultArgs],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  const results = parseList(stdout);

  t.is(exitCode, 0);
  t.true(results.includes(context.deployment));
});

testv1('scale the v1 alias', async t => {
  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    ['scale', context.alias, 'bru', '1', ...defaultArgs],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 0, `Received:\n${stdout}\n${stderr}`);
  t.true(stdout.includes(`(min: 1, max: 1)`));
});

testv1('remove the explicit alias', async t => {
  const goal = `> Success! Alias ${context.alias} removed`;

  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    ['alias', 'rm', context.alias, '--yes', ...defaultArgs],
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

testv1('create an v1 alias from "now.json" `alias` for deployment', async t => {
  const target = fixture('dockerfile');

  // Add the `alias` field to the "now.json" file
  const jsonPath = path.join(target, 'now.json');
  const json = JSON.parse(await readFile(jsonPath, 'utf8'));
  json.alias = `${session}-from-nowjson.now.sh`;
  await writeFile(jsonPath, JSON.stringify(json));

  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    ['alias', ...defaultArgs],
    {
      cwd: target,
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  const goal = `> Success! https://${json.alias} now points to https://${context.deployment}`;

  t.is(exitCode, 0);
  t.true(stdout.startsWith(goal));

  // Send a test request to the alias
  const response = await fetch(`https://${json.alias}`);
  const contentType = response.headers.get('content-type');
  const content = await response.json();

  t.is(contentType, 'application/json; charset=utf-8');
  t.is(content.id, contextName);

  context.alias = json.alias;
});

testv1('remove the alias from "now.json" `alias`', async t => {
  const goal = `> Success! Alias ${context.alias} removed`;

  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    ['alias', 'rm', context.alias, '--yes', ...defaultArgs],
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

test('ignore files specified in .nowignore', async t => {
  const directory = fixture('nowignore');

  const args = ['--debug', '--public', '--name', session, ...defaultArgs];
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

  const args = ['--debug', '--public', '--name', session, ...defaultArgs];
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

testv1('scale down the deployment directly', async t => {
  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    ['scale', context.deployment, 'bru', '0', ...defaultArgs],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 0);
  t.true(stdout.includes(`(min: 0, max: 0)`));
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

  const include = `✔ ${contextName}     ${email}`;
  t.true(
    stdout.includes(include),
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

test('try to purchase a domain', async t => {
  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    ['domains', 'buy', `${session}-test.org`, ...defaultArgs],
    {
      reject: false,
      input: 'y',
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 1);
  t.true(
    stderr.includes(
      `> Error! Could not purchase domain. Please add a payment method using \`now billing add\`.`
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
      `> Error! The domain "${session}-test.org" is not transferable.`
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

  t.true(stderr.includes(`> Error! Domain not found under `));
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

test('use `-V 1` to deploy a GitHub repository', async t => {
  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    ['-V', 1, '--public', '--name', session, ...defaultArgs, 'leo/hub'],
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
  const { href, host } = new URL(stdout);
  t.is(host.split('-')[0], session);

  // Send a test request to the deployment
  const response = await fetch(href, {
    headers: {
      Accept: 'application/json',
    },
  });

  const contentType = response.headers.get('content-type');
  t.is(contentType, 'application/json; charset=utf-8');
});

test('use `--platform-version 1` to deploy a GitHub repository', async t => {
  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    [
      '--platform-version',
      1,
      '--public',
      '--name',
      session,
      ...defaultArgs,
      'leo/hub',
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
  const { href, host } = new URL(stdout);
  t.is(host.split('-')[0], session);

  // Send a test request to the deployment
  const response = await fetch(href, {
    headers: {
      Accept: 'application/json',
    },
  });

  const contentType = response.headers.get('content-type');
  t.is(contentType, 'application/json; charset=utf-8');
});

test('set platform version using `-V` to `1`', async t => {
  const directory = fixture('builds');
  const goal =
    '> Error! The property `builds` is only allowed on Now 2.0 — please upgrade';

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [directory, '--public', '--name', session, ...defaultArgs, '-V', 1],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  // Ensure the exit code is right
  t.is(exitCode, 1);

  // Ensure the error message shows up
  t.true(stderr.includes(goal));
});

test('set platform version using `--platform-version` to `1`', async t => {
  const directory = fixture('builds');
  const goal =
    '> Error! The property `builds` is only allowed on Now 2.0 — please upgrade';

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [
      directory,
      '--public',
      '--name',
      session,
      ...defaultArgs,
      '--platform-version',
      1,
    ],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  // Ensure the exit code is right
  t.is(exitCode, 1);

  // Ensure the error message shows up
  t.true(stderr.includes(goal));
});

test('set platform version using `-V` to invalid number', async t => {
  const directory = fixture('builds');
  const goal =
    '> Error! The "--platform-version" option must be either `1` or `2`.';

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [directory, '--public', '--name', session, ...defaultArgs, '-V', 3],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  // Ensure the exit code is right
  t.is(exitCode, 1);

  // Ensure the error message shows up
  t.true(stderr.includes(goal));
});

test('set platform version using `--platform-version` to invalid number', async t => {
  const directory = fixture('builds');
  const goal =
    '> Error! The "--platform-version" option must be either `1` or `2`.';

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [
      directory,
      '--public',
      '--name',
      session,
      ...defaultArgs,
      '--platform-version',
      3,
    ],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  // Ensure the exit code is right
  t.is(exitCode, 1);

  // Ensure the error message shows up
  t.true(stderr.includes(goal));
});

test('set platform version using `-V` to `2`', async t => {
  const directory = fixture('builds');

  const { stdout, stderr, exitCode } = await execa(
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
    ],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  const output = `Received:\n"${stderr}"\n"${stdout}"`;

  // Ensure the exit code is right
  t.is(exitCode, 0, output);

  // Test if the output is really a URL
  const { href, host } = new URL(stdout);
  t.is(host.split('-')[0], session, output);

  if (host) {
    context.deployment = host;
  }

  // Send a test request to the deployment
  const response = await fetch(href);
  const contentType = response.headers.get('content-type');

  t.is(contentType, 'text/html; charset=utf-8');
});

test('output logs of a 2.0 deployment', async t => {
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

  t.true(stderr.includes(`Fetched deployment "${context.deployment}"`));
  t.is(exitCode, 0);
});

test('output logs of a 2.0 deployment without annotate', async t => {
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

  t.true(!stderr.includes('[now-builder-debug]'));
  t.true(!stderr.includes('START RequestId'));
  t.true(!stderr.includes('END RequestId'));
  t.true(!stderr.includes('REPORT RequestId'));
  t.true(!stderr.includes('Init Duration'));
  t.true(!stderr.includes('XRAY TraceId'));
  t.is(exitCode, 0);
});

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
  const response = await fetch(`https://test.${contextName}.now.sh`);
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

test('ensure type and instance count in list is right', async t => {
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

  const line = stdout.split('\n').find(line => line.includes('.now.sh'));
  const columns = line.split(/\s+/);

  // Ensure those columns only contain a dash
  t.is(columns[3], '-');
  t.is(columns[4], '-');
});

test('set platform version using `--platform-version` to `2`', async t => {
  const directory = fixture('builds');

  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    [
      directory,
      '--public',
      '--name',
      session,
      ...defaultArgs,
      '--platform-version',
      2,
      '--force',
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
  const { href, host } = new URL(stdout);
  t.is(host.split('-')[0], session);

  // Send a test request to the deployment
  const response = await fetch(href);
  const contentType = response.headers.get('content-type');

  t.is(contentType, 'text/html; charset=utf-8');
});

test('ensure we render a warning for deployments with no files', async t => {
  const directory = fixture('single-dotfile');

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [directory, '--public', '--name', session, ...defaultArgs, '--force'],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  // Ensure the warning is printed
  t.true(
    stderr.includes(
      '> WARN! There are no files (or only files starting with a dot) inside your deployment.'
    )
  );

  // Test if the output is really a URL
  const { href, host } = new URL(stdout);
  t.is(host.split('-')[0], session);

  // Ensure the exit code is right
  t.is(exitCode, 0);

  // Send a test request to the deployment
  const response = await fetch(href);
  const contentType = response.headers.get('content-type');

  t.is(contentType, 'text/plain; charset=utf-8');
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
      '> You are deploying your home directory. Do you want to continue? [y|N]'
    )
  );
  t.true(stderr.includes('> Aborted'));
});

test('ensure the `scope` property works with email', async t => {
  const directory = fixture('config-scope-property-email');

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [directory, '--public', '--name', session, ...defaultArgs, '--force'],
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
    [directory, '--public', '--name', session, ...defaultArgs, '--force'],
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

test('try to create a builds deployments with wrong config', async t => {
  const directory = fixture('builds-wrong');

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [directory, '--public', '--name', session, ...defaultArgs, '--force'],
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
      '> Error! The property `builder` is not allowed in now.json when using Now 2.0 – please remove it.'
    )
  );
});

test('create a builds deployments with no actual builds', async t => {
  const directory = fixture('builds-no-list');

  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    [directory, '--public', '--name', session, ...defaultArgs, '--force'],
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

test('create a builds deployments without platform version flag', async t => {
  const directory = fixture('builds');

  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    [directory, '--public', '--name', session, ...defaultArgs, '--force'],
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
  const { href, host } = new URL(stdout);
  t.is(host.split('-')[0], session);

  // Send a test request to the deployment
  const response = await fetch(href);
  const contentType = response.headers.get('content-type');

  t.is(contentType, 'text/html; charset=utf-8');
});

test('deploy multiple static files', async t => {
  const directory = fixture('static-multiple-files');

  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    [directory, '--public', '--name', session, ...defaultArgs],
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
  const { href, host } = new URL(stdout);
  t.is(host.split('-')[0], session);

  // Send a test request to the deployment
  const response = await fetch(href, {
    headers: {
      Accept: 'application/json',
    },
  });

  const contentType = response.headers.get('content-type');
  t.is(contentType, 'application/json; charset=utf-8');

  const content = await response.json();
  t.is(content.files.length, 3);
});

test('create a staging deployment', async t => {
  const directory = fixture('static-deployment');

  const args = ['--debug', '--public', '--name', session, ...defaultArgs];
  const targetCall = await execa(binaryPath, [
    directory,
    '--target=staging',
    ...args,
  ]);

  console.log(targetCall.stderr);
  console.log(targetCall.stdout);
  console.log(targetCall.exitCode);

  t.regex(
    targetCall.stderr,
    /Setting target to staging/gm,
    formatOutput(targetCall)
  );

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

  const { host } = new URL(call.stdout);
  const deployment = await apiFetch(
    `/v10/now/deployments/unknown?url=${host}`
  ).then(resp => resp.json());
  t.is(deployment.target, 'production', JSON.stringify(deployment, null, 2));
});

test('ensure we are getting a warning for the old team flag', async t => {
  const directory = fixture('static-multiple-files');

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [directory, '--public', '--name', session, '--team', email, ...defaultArgs],
    {
      reject: false,
    }
  );

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  // Ensure the warning is printed
  t.true(
    stderr.includes(
      'WARN! The "--team" flag is deprecated. Please use "--scope" instead.'
    )
  );

  // Ensure the exit code is right
  t.is(exitCode, 0);

  // Test if the output is really a URL
  const { href, host } = new URL(stdout);
  t.is(host.split('-')[0], session);

  // Send a test request to the deployment
  const response = await fetch(href, {
    headers: {
      Accept: 'application/json',
    },
  });

  const contentType = response.headers.get('content-type');
  t.is(contentType, 'application/json; charset=utf-8');

  const content = await response.json();
  t.is(content.files.length, 3);
});

test('deploy multiple static files with custom scope', async t => {
  const directory = fixture('static-multiple-files');

  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    [
      directory,
      '--public',
      '--name',
      session,
      '--scope',
      email,
      ...defaultArgs,
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
  const { href, host } = new URL(stdout);
  t.is(host.split('-')[0], session);

  // Send a test request to the deployment
  const response = await fetch(href, {
    headers: {
      Accept: 'application/json',
    },
  });

  const contentType = response.headers.get('content-type');
  t.is(contentType, 'application/json; charset=utf-8');

  const content = await response.json();
  t.is(content.files.length, 3);
});

test('deploy single static file', async t => {
  const file = fixture('static-single-file/first.png');

  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    [file, '--public', '--name', session, ...defaultArgs],
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
  const { href, host } = new URL(stdout);
  t.is(host.split('-')[0], session);

  // Send a test request to the deployment
  const response = await fetch(href);
  const contentType = response.headers.get('content-type');

  t.is(contentType, 'image/png');
  t.deepEqual(await readFile(file), await response.buffer());
});

test('deploy a static directory', async t => {
  const directory = fixture('static-single-file');

  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    [directory, '--public', '--name', session, ...defaultArgs],
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
  const { href, host } = new URL(stdout);
  t.is(host.split('-')[0], session);

  // Send a test request to the deployment
  const response = await fetch(href);
  const contentType = response.headers.get('content-type');

  t.is(contentType, 'text/html; charset=utf-8');
});

test('deploy a static build deployment', async t => {
  const directory = fixture('now-static-build');

  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    [directory, '--public', '--name', session, ...defaultArgs],
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
  const deploymentUrl = pickUrl(stdout);
  const { href, host } = new URL(deploymentUrl);
  t.is(host.split('-')[0], session);

  await waitForDeployment(href);

  // get the content
  const response = await fetch(href);
  const content = await response.text();
  t.is(content.trim(), 'hello');
});

test('use `--debug` CLI flag', async t => {
  const directory = fixture('build-env-debug');

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [directory, '--public', '--name', session, '--debug', ...defaultArgs],
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
  const goal = `> Error! The specified file or directory "${session}" does not exist.`;

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [session, ...defaultArgs],
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
  const target = fixture('node');
  const goal = `> Error! The specified scope does not exist`;

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [target, '--scope', session, ...defaultArgs],
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

testv1('try to deploy v1 deployment with --prod', async t => {
  const target = fixture('node');
  const goal = `is not supported for Now 1.0 deployments`;

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [target, '--prod'],
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

testv1('try to deploy v1 deployment with --target production', async t => {
  const target = fixture('node');
  const goal = `is not supported for Now 1.0 deployments`;

  const { stderr, stdout, exitCode } = await execa(
    binaryPath,
    [target, '--target', 'production'],
    { reject: false }
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

  createDirectory(path.join(cwd, 'angular'));
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
  t.true(stdout.includes(goal));
  t.true(verifyExampleAngular(cwd, 'angular'));
});

test('try to initialize example to existing directory', async t => {
  tmpDir = tmp.dirSync({ unsafeCleanup: true });
  const cwd = tmpDir.name;
  const goal =
    '> Error! Destination path "angular" already exists and is not an empty directory. You may use `--force` or `--f` to override it.';

  createDirectory(path.join(cwd, 'angular'));
  createFile(path.join(cwd, 'angular', '.gitignore'));
  const { stdout, stderr, exitCode } = await execute(['init', 'angular'], {
    cwd,
    input: '\n',
  });

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 1);
  t.true(stdout.includes(goal));
});

test('try to initialize misspelled example (noce) in non-tty', async t => {
  tmpDir = tmp.dirSync({ unsafeCleanup: true });
  const cwd = tmpDir.name;
  const goal =
    '> Error! No example found for noce, run `now init` to see the list of available examples.';

  const { stdout, stderr, exitCode } = await execute(['init', 'noce'], { cwd });

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 1);
  t.true(stdout.includes(goal));
});

test('try to initialize example "example-404"', async t => {
  tmpDir = tmp.dirSync({ unsafeCleanup: true });
  const cwd = tmpDir.name;
  const goal =
    '> Error! No example found for example-404, run `now init` to see the list of available examples.';

  const { stdout, stderr, exitCode } = await execute(['init', 'example-404'], {
    cwd,
  });

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  t.is(exitCode, 1);
  t.true(stdout.includes(goal));
});

test('try to revert a deployment and assign the automatic aliases', async t => {
  const firstDeployment = fixture('now-revert-alias-1');
  const secondDeployment = fixture('now-revert-alias-2');

  const { name } = JSON.parse(
    fs.readFileSync(path.join(firstDeployment, 'now.json'))
  );
  const url = `https://${name}.user.now.sh`;

  {
    const { stdout: deploymentUrl, stderr, exitCode } = await execute([
      firstDeployment,
    ]);

    console.log(stderr);
    console.log(deploymentUrl);
    console.log(exitCode);

    t.is(exitCode, 0);

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
    ]);

    console.log(stderr);
    console.log(deploymentUrl);
    console.log(exitCode);

    t.is(exitCode, 0);

    await waitForDeployment(deploymentUrl);
    await sleep(20000);

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
    ]);
    console.log(stderr);
    console.log(deploymentUrl);
    console.log(exitCode);

    t.is(exitCode, 0);

    await waitForDeployment(deploymentUrl);
    await sleep(20000);

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

test('print correct link in legacy warning', async t => {
  const deploymentPath = fixture('v1-warning-link');
  const { exitCode, stderr, stdout } = await execute([deploymentPath]);

  console.log(stderr);
  console.log(stdout);
  console.log(exitCode);

  // It is expected to fail,
  // since the package.json does not have a start script
  t.is(exitCode, 1);
  t.regex(stderr, /migrate-to-vercel/);
});

test('`now rm` 404 exits quickly', async t => {
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
  const output = await execute([deploymentPath]);

  console.log(output.stderr);
  console.log(output.stdout);
  console.log(output.exitCode);

  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(output.stderr, /Build failed/gm, formatOutput(output));
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

test('now certs ls', async t => {
  const output = await execute(['certs', 'ls']);

  console.log(output.stderr);
  console.log(output.stdout);
  console.log(output.exitCode);

  t.is(output.exitCode, 0, formatOutput(output));
  t.regex(output.stderr, /certificates? found under/gm, formatOutput(output));
});

test('now certs ls --next=123456', async t => {
  const output = await execute(['certs', 'ls', '--next=123456']);

  console.log(output.stderr);
  console.log(output.stdout);
  console.log(output.exitCode);

  t.is(output.exitCode, 0, formatOutput(output));
  t.regex(output.stderr, /No certificates found under/gm, formatOutput(output));
});

test('now hasOwnProperty not a valid subcommand', async t => {
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
  const output = await execute([fixturePath, '--force', '--public']);

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

  t.true(validBuilders, JSON.stringify(data, null, 2));
});

test('now secret add', async t => {
  context.secretName = `my-secret-${Date.now().toString(36)}`;
  const value = 'https://my-secret-endpoint.com';

  const output = await execute(['secret', 'add', context.secretName, value]);

  console.log(output.stderr);
  console.log(output.stdout);
  console.log(output.exitCode);

  t.is(output.exitCode, 0, formatOutput(output));
});

test('now secret ls', async t => {
  const output = await execute(['secret', 'ls']);

  console.log(output.stderr);
  console.log(output.stdout);
  console.log(output.exitCode);

  t.is(output.exitCode, 0, formatOutput(output));
  t.regex(output.stdout, /Secrets found under/gm, formatOutput(output));
  t.regex(output.stdout, new RegExp(), formatOutput(output));
});

test('now secret rename', async t => {
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

test('now secret rm', async t => {
  const output = await execute(['secret', 'rm', context.secretName, '-y']);

  console.log(output.stderr);
  console.log(output.stdout);
  console.log(output.exitCode);

  t.is(output.exitCode, 0, formatOutput(output));
});

test('deploy with a custom API URL', async t => {
  const directory = fixture('static-single-file');

  const { stdout, stderr, exitCode } = await execa(
    binaryPath,
    [
      directory,
      '--public',
      '--name',
      session,
      '--api',
      'https://vercel.com/api',
      ...defaultArgs,
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
  const { href, host } = new URL(stdout);
  t.is(host.split('-')[0], session);

  // Send a test request to the deployment
  const response = await fetch(href);
  const contentType = response.headers.get('content-type');

  t.is(contentType, 'text/html; charset=utf-8');
});

test.after.always(async () => {
  // Make sure the token gets revoked
  await execa(binaryPath, ['logout', ...defaultArgs]);

  if (!tmpDir) {
    return;
  }

  // Remove config directory entirely
  tmpDir.removeCallback();
});
