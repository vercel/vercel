import path from 'path';
import { URL } from 'url';
import test from 'ava';
import semVer from 'semver';
import fs from 'fs';
import execa from 'execa';
import fetch from 'node-fetch';
import tmp from 'tmp-promise';
import logo from '../src/util/output/logo';
import sleep from '../src/util/sleep';
import pkg from '../package';
import parseList from './helpers/parse-list';
import prepareFixtures from './helpers/prepare';

const binary = {
  darwin: 'now-macos',
  linux: 'now-linux',
  win32: 'now-win.exe'
}[process.platform];

const binaryPath = path.resolve(__dirname, `../packed/${binary}`);
const fixture = name => path.join(__dirname, 'fixtures', 'integration', name);
const deployHelpMessage = `${logo} now [options] <command | path>`;
const session = Math.random()
  .toString(36)
  .split('.')[1];

const pickUrl = stdout => {
  const lines = stdout.split('\n');
  return lines[lines.length - 1];
};

const waitForDeployment = async href => {
  // eslint-disable-next-line
  while (true) {
    const response = await fetch(href, { redirect: 'manual' });
    if (response.status === 200) {
      break;
    }

    sleep(2000);
  }
};

// AVA's `t.context` can only be set before the tests,
// but we want to set it within as well
const context = {};

const defaultOptions = { reject: false };
const defaultArgs = [];
const email = `now-cli-${session}@zeit.pub`;

let tmpDir;

if (!process.env.CI) {
  tmpDir = tmp.dirSync({
    // This ensures the directory gets
    // deleted even if it has contents
    unsafeCleanup: true
  });

  defaultArgs.push('-Q', path.join(tmpDir.name, '.now'));
}

test.before(async () => {
  try {
    prepareFixtures(session);
  } catch (err) {
    console.error(err);
  }
});

const execute = (args, options) => execa(
  binaryPath,
  [...defaultArgs, ...args],
  {...defaultOptions, ...options}
);

test('print the deploy help message', async t => {
  const { stderr, code } = await execa(binaryPath, ['help', ...defaultArgs], {
    reject: false
  });

  t.is(code, 2);
  t.true(stderr.includes(deployHelpMessage));
});

test('output the version', async t => {
  const { stdout, code } = await execa(
    binaryPath,
    ['--version', ...defaultArgs],
    {
      reject: false
    }
  );

  const version = stdout.trim();

  t.is(code, 0);
  t.truthy(semVer.valid(version));
  t.is(version, pkg.version);
});

test('log in', async t => {
  const { stdout, code } = await execa(
    binaryPath,
    ['login', email, ...defaultArgs],
    {
      reject: false
    }
  );

  const location = path.join(tmpDir ? tmpDir.name : '~', '.now');
  const goal = `> Ready! Authentication token and personal details saved in "${location}"`;
  const lines = stdout.trim().split('\n');
  const last = lines[lines.length - 1];

  t.is(code, 0);
  t.is(last, goal);
});

test('warn --project instead --name in V2', async t => {
  const directory = fixture('node');
  const goal =
    'The option `--name` (or `-n`) is deprecated';

  const { stderr, code } = await execa(
    binaryPath,
    [directory, '--public', '--name', session, ...defaultArgs, '-V', 2],
    {
      reject: false
    }
  );

  // Ensure the exit code is right
  t.is(code, 0);

  // Ensure the error message shows up
  t.true(stderr.includes(goal));
});

test('warn --project instead --name in V1', async t => {
  const directory = fixture('node');
  const goal =
    'The option --name (or -n) is deprecated';

  const { stderr, code } = await execa(
    binaryPath,
    [directory, '--public', '--name', session, ...defaultArgs, '-V', 1],
    {
      reject: false
    }
  );

  // Ensure the exit code is right
  t.is(code, 0);

  // Ensure the error message shows up
  t.true(stderr.includes(goal));
});

test('deploy a node microservice', async t => {
  const target = fixture('node');

  const { stdout, code } = await execa(
    binaryPath,
    [target, '--public', '--project', session, ...defaultArgs],
    {
      reject: false
    }
  );

  // Ensure the exit code is right
  t.is(code, 0);

  // Test if the output is really a URL
  const { href, host } = new URL(stdout);
  t.is(host.split('-')[0], session);

  // Send a test request to the deployment
  const response = await fetch(href);
  const contentType = response.headers.get('content-type');
  const content = await response.json();

  t.is(contentType, 'application/json; charset=utf-8');
  t.is(content.id, session);
});

test('find deployment in list', async t => {
  const { stdout, code } = await execa(binaryPath, ['ls', ...defaultArgs], {
    reject: false
  });

  const deployments = parseList(stdout);

  t.true(deployments.length > 0);
  t.is(code, 0);

  const target = deployments.find(deployment =>
    deployment.includes(`${session}-`)
  );

  t.truthy(target);

  if (target) {
    context.deployment = target;
  }
});

test('find deployment in list with mixed args', async t => {
  const { stdout, code } = await execa(
    binaryPath,
    ['--debug', 'ls', ...defaultArgs],
    {
      reject: false
    }
  );

  const deployments = parseList(stdout);

  t.true(deployments.length > 0);
  t.is(code, 0);

  const target = deployments.find(deployment =>
    deployment.includes(`${session}-`)
  );

  t.truthy(target);

  if (target) {
    context.deployment = target;
  }
});

test('output logs of a 1.0 deployment', async t => {
  const { stdout, code } = await execa(
    binaryPath,
    ['logs', context.deployment, ...defaultArgs],
    {
      reject: false
    }
  );

  t.true(stdout.includes('yarn install'));
  t.true(stdout.includes('Snapshotting deployment'));
  t.true(stdout.includes('Saving deployment image'));
  t.true(stdout.includes('npm start'));
  t.true(stdout.includes('> micro'));
  t.true(stdout.includes('micro: Accepting connections on port 3000'));
  t.is(code, 0);
});

test('create alias for deployment', async t => {
  const hosts = {
    deployment: context.deployment,
    alias: `${session}.now.sh`
  };

  const { stdout, code } = await execa(
    binaryPath,
    ['alias', hosts.deployment, hosts.alias, ...defaultArgs],
    {
      reject: false
    }
  );

  const goal = `> Success! ${hosts.alias} now points to ${hosts.deployment}`;

  t.is(code, 0);
  t.true(stdout.startsWith(goal));

  // Send a test request to the alias
  const response = await fetch(`https://${hosts.alias}`);
  const contentType = response.headers.get('content-type');
  const content = await response.json();

  t.is(contentType, 'application/json; charset=utf-8');
  t.is(content.id, session);

  context.alias = hosts.alias;
});

test('list the aliases', async t => {
  const { stdout, code } = await execa(
    binaryPath,
    ['alias', 'ls', ...defaultArgs],
    {
      reject: false
    }
  );

  const results = parseList(stdout);

  t.is(code, 0);
  t.true(results.includes(context.deployment));
});

test('scale the alias', async t => {
  const { stdout, code } = await execa(
    binaryPath,
    ['scale', context.alias, 'bru', '1', ...defaultArgs],
    {
      reject: false
    }
  );

  t.is(code, 0);
  t.true(stdout.includes(`(min: 1, max: 1)`));
});

test('remove the alias', async t => {
  const goal = `> Success! Alias ${context.alias} removed`;

  const { stdout, code } = await execa(
    binaryPath,
    ['alias', 'rm', context.alias, '--yes', ...defaultArgs],
    {
      reject: false
    }
  );

  t.is(code, 0);
  t.true(stdout.startsWith(goal));
});

test('scale down the deployment directly', async t => {
  const { stdout, code } = await execa(
    binaryPath,
    ['scale', context.deployment, 'bru', '0', ...defaultArgs],
    {
      reject: false
    }
  );

  t.is(code, 0);
  t.true(stdout.includes(`(min: 0, max: 0)`));
});

test('list the scopes', async t => {
  const { stdout, code } = await execa(
    binaryPath,
    ['teams', 'ls', ...defaultArgs],
    {
      reject: false
    }
  );

  t.is(code, 0);
  t.true(stdout.includes(`✔ ${email}     ${email}`));
});

test('list the payment methods', async t => {
  const { stdout, code } = await execa(
    binaryPath,
    ['billing', 'ls', ...defaultArgs],
    {
      reject: false
    }
  );

  t.is(code, 0);
  t.true(stdout.startsWith(`> 0 cards found under ${email}`));
});

test('try to purchase a domain', async t => {
  const { stderr, code } = await execa(
    binaryPath,
    ['domains', 'buy', `${session}-test.org`, ...defaultArgs],
    {
      reject: false,
      input: 'y'
    }
  );

  t.is(code, 1);
  t.true(stderr.includes(`> Error! Could not purchase domain. Please add a payment method using \`now billing add\`.`));
});

test('try to set default without existing payment method', async t => {
  const { stderr, code } = await execa(
    binaryPath,
    ['billing', 'set-default', ...defaultArgs],
    {
      reject: false
    }
  );

  t.is(code, 0);
  t.true(stderr.includes('You have no credit cards to choose from'));
});

test('try to remove a non-existing payment method', async t => {
  const { stderr, code } = await execa(
    binaryPath,
    ['billing', 'rm', 'card_d2j32d9382jr928rd', ...defaultArgs],
    {
      reject: false
    }
  );

  t.is(code, 0);
  t.true(
    stderr.includes(
      `You have no credit cards to choose from to delete under ${email}`
    )
  );
});

test('use `-V 1` to deploy a GitHub repository', async t => {
  const { stdout, code } = await execa(
    binaryPath,
    ['-V', 1, '--public', '--project', session, ...defaultArgs, 'leo/hub'],
    {
      reject: false
    }
  );

  // Ensure the exit code is right
  t.is(code, 0);

  // Test if the output is really a URL
  const { href, host } = new URL(stdout);
  t.is(host.split('-')[0], session);

  // Send a test request to the deployment
  const response = await fetch(href, {
    headers: {
      Accept: 'application/json'
    }
  });

  const contentType = response.headers.get('content-type');
  t.is(contentType, 'application/json; charset=utf-8');
});

test('use `--platform-version 1` to deploy a GitHub repository', async t => {
  const { stdout, code } = await execa(
    binaryPath,
    [
      '--platform-version',
      1,
      '--public',
      '--project',
      session,
      ...defaultArgs,
      'leo/hub'
    ],
    {
      reject: false
    }
  );

  // Ensure the exit code is right
  t.is(code, 0);

  // Test if the output is really a URL
  const { href, host } = new URL(stdout);
  t.is(host.split('-')[0], session);

  // Send a test request to the deployment
  const response = await fetch(href, {
    headers: {
      Accept: 'application/json'
    }
  });

  const contentType = response.headers.get('content-type');
  t.is(contentType, 'application/json; charset=utf-8');
});

test('set platform version using `-V` to `1`', async t => {
  const directory = fixture('builds');
  const goal =
    '> Error! The property `builds` is only allowed on Now 2.0 — please upgrade';

  const { stderr, code } = await execa(
    binaryPath,
    [directory, '--public', '--project', session, ...defaultArgs, '-V', 1],
    {
      reject: false
    }
  );

  // Ensure the exit code is right
  t.is(code, 1);

  // Ensure the error message shows up
  t.true(stderr.includes(goal));
});

test('set platform version using `--platform-version` to `1`', async t => {
  const directory = fixture('builds');
  const goal =
    '> Error! The property `builds` is only allowed on Now 2.0 — please upgrade';

  const { stderr, code } = await execa(
    binaryPath,
    [
      directory,
      '--public',
      '--project',
      session,
      ...defaultArgs,
      '--platform-version',
      1
    ],
    {
      reject: false
    }
  );

  // Ensure the exit code is right
  t.is(code, 1);

  // Ensure the error message shows up
  t.true(stderr.includes(goal));
});

test('set platform version using `-V` to invalid number', async t => {
  const directory = fixture('builds');
  const goal =
    '> Error! The "--platform-version" option must be either `1` or `2`.';

  const { stderr, code } = await execa(
    binaryPath,
    [directory, '--public', '--project', session, ...defaultArgs, '-V', 3],
    {
      reject: false
    }
  );

  // Ensure the exit code is right
  t.is(code, 1);

  // Ensure the error message shows up
  t.true(stderr.includes(goal));
});

test('set platform version using `--platform-version` to invalid number', async t => {
  const directory = fixture('builds');
  const goal =
    '> Error! The "--platform-version" option must be either `1` or `2`.';

  const { stderr, code } = await execa(
    binaryPath,
    [
      directory,
      '--public',
      '--project',
      session,
      ...defaultArgs,
      '--platform-version',
      3
    ],
    {
      reject: false
    }
  );

  // Ensure the exit code is right
  t.is(code, 1);

  // Ensure the error message shows up
  t.true(stderr.includes(goal));
});

test('set platform version using `-V` to `2`', async t => {
  const directory = fixture('builds');

  const { stdout, stderr, code } = await execa(
    binaryPath,
    [
      directory,
      '--public',
      '--project',
      session,
      ...defaultArgs,
      '-V',
      2,
      '--force'
    ],
    {
      reject: false
    }
  );

  // Ensure the exit code is right
  t.is(code, 0);

  // Ensure the listing includes the necessary parts
  const wanted = [session, 'index.html'];

  t.true(wanted.every(item => stderr.includes(item)));

  // Test if the output is really a URL
  const { href, host } = new URL(stdout);
  t.is(host.split('-')[0], session);

  if (host) {
    context.deployment = host;
  }

  // Send a test request to the deployment
  const response = await fetch(href);
  const contentType = response.headers.get('content-type');

  t.is(contentType, 'text/html; charset=utf-8');
});

test('output logs of a 2.0 deployment', async t => {
  const { stderr, code } = await execa(
    binaryPath,
    ['logs', context.deployment, ...defaultArgs],
    {
      reject: false
    }
  );

  t.true(stderr.includes(`Fetched deployment "${context.deployment}"`));
  t.is(code, 0);
});

test('ensure type and instance count in list is right', async t => {
  const { stdout, code } = await execa(binaryPath, ['ls', ...defaultArgs], {
    reject: false
  });

  // Ensure the exit code is right
  t.is(code, 0);

  const line = stdout.split('\n').find(line => line.includes('.now.sh'));
  const columns = line.split(/\s+/);

  // Ensure those columns only contain a dash
  t.is(columns[3], '-');
  t.is(columns[4], '-');
});

test('set platform version using `--platform-version` to `2`', async t => {
  const directory = fixture('builds');

  const { stdout, stderr, code } = await execa(
    binaryPath,
    [
      directory,
      '--public',
      '--project',
      session,
      ...defaultArgs,
      '--platform-version',
      2,
      '--force'
    ],
    {
      reject: false
    }
  );

  // Ensure the exit code is right
  t.is(code, 0);

  // Ensure the listing includes the necessary parts
  const wanted = [session, 'index.html'];

  t.true(wanted.every(item => stderr.includes(item)));

  // Test if the output is really a URL
  const { href, host } = new URL(stdout);
  t.is(host.split('-')[0], session);

  // Send a test request to the deployment
  const response = await fetch(href);
  const contentType = response.headers.get('content-type');

  t.is(contentType, 'text/html; charset=utf-8');
});

test('ensure the `alias` property is not sent to the API', async t => {
  const directory = fixture('config-alias-property');

  const { stderr, stdout, code } = await execa(
    binaryPath,
    [directory, '--public', '--project', session, ...defaultArgs, '--force'],
    {
      reject: false
    }
  );

  // Ensure the exit code is right
  t.is(code, 0);

  // Ensure the listing includes the necessary parts
  const wanted = [session, 'index.html'];

  t.true(wanted.every(item => stderr.includes(item)));

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

  const { stderr, code } = await execa(
    binaryPath,
    [directory, '--public', '--project', session, ...defaultArgs, '--force'],
    {
      reject: false
    }
  );

  // Ensure the exit code is right
  t.is(code, 1);
  t.true(
    stderr.includes(
      '> Error! The property `builder` is not allowed in now.json when using Now 2.0 – please remove it.'
    )
  );
});

test('create a builds deployments without platform version flag', async t => {
  const directory = fixture('builds');

  const { stdout, stderr, code } = await execa(
    binaryPath,
    [directory, '--public', '--project', session, ...defaultArgs, '--force'],
    {
      reject: false
    }
  );

  // Ensure the exit code is right
  t.is(code, 0);

  // Ensure the listing includes the necessary parts
  const wanted = [session, 'index.html'];

  t.true(wanted.every(item => stderr.includes(item)));

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

  const { stdout, code } = await execa(
    binaryPath,
    [directory, '--public', '--project', session, ...defaultArgs],
    {
      reject: false
    }
  );

  // Ensure the exit code is right
  t.is(code, 0);

  // Test if the output is really a URL
  const { href, host } = new URL(stdout);
  t.is(host.split('-')[0], session);

  // Send a test request to the deployment
  const response = await fetch(href, {
    headers: {
      Accept: 'application/json'
    }
  });

  const contentType = response.headers.get('content-type');
  t.is(contentType, 'application/json; charset=utf-8');

  const content = await response.json();
  t.is(content.files.length, 3);
});

test('deploy single static file', async t => {
  const file = fixture('static-single-file/first.png');

  const { stdout, code } = await execa(
    binaryPath,
    [file, '--public', '--project', session, ...defaultArgs],
    {
      reject: false
    }
  );

  // Ensure the exit code is right
  t.is(code, 0);

  // Test if the output is really a URL
  const { href, host } = new URL(stdout);
  t.is(host.split('-')[0], session);

  // Send a test request to the deployment
  const response = await fetch(href);
  const contentType = response.headers.get('content-type');

  t.is(contentType, 'image/png');
  t.deepEqual(await fs.promises.readFile(file), await response.buffer());
});

test('deploy a static directory', async t => {
  const directory = fixture('static-single-file');

  const { stdout, code } = await execa(
    binaryPath,
    [directory, '--public', '--project', session, ...defaultArgs],
    {
      reject: false
    }
  );

  // Ensure the exit code is right
  t.is(code, 0);

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

  const { stdout, code } = await execa(
    binaryPath,
    [directory, '--public', '--project', session, ...defaultArgs],
    {
      reject: false
    }
  );

  // Ensure the exit code is right
  t.is(code, 0);

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

test('use build-env', async t => {
  const directory = fixture('build-env');

  const { stdout, code } = await execa(
    binaryPath,
    [directory, '--public', '--project', session, ...defaultArgs],
    {
      reject: false
    }
  );

  // Ensure the exit code is right
  t.is(code, 0);

  // Test if the output is really a URL
  const deploymentUrl = pickUrl(stdout);
  const { href, host } = new URL(deploymentUrl);
  t.is(host.split('-')[0], session);

  await waitForDeployment(href);

  // get the content
  const response = await fetch(href);
  const content = await response.text();
  t.is(content.trim(), 'bar');
});

test('deploy a dockerfile project', async t => {
  const target = fixture('dockerfile');

  const { stdout, code } = await execa(
    binaryPath,
    [
      target,
      '--public',
      '--project',
      session,
      '--docker',
      '--no-verify',
      ...defaultArgs
    ],
    {
      reject: false
    }
  );

	// Ensure the exit code is right
  t.is(code, 0);

  // Test if the output is really a URL
  const { href, host } = new URL(stdout);
  t.is(host.split('-')[0], session);

  // Send a test request to the deployment
  const response = await fetch(href);
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
  t.is(content.id, session);
});

test('use `--build-env` CLI flag', async t => {
  const directory = fixture('build-env-arg');
  const nonce = Math.random()
    .toString(36)
    .substring(2);

  const { stdout, code } = await execa(
    binaryPath,
    [
      directory,
      '--public',
      '--project',
      session,
      '--build-env',
      `NONCE=${nonce}`,
      ...defaultArgs
    ],
    {
      reject: false
    }
  );

  // Ensure the exit code is right
  t.is(code, 0);

  // Test if the output is really a URL
  const deploymentUrl = pickUrl(stdout);
  const { href, host } = new URL(deploymentUrl);
  t.is(host.split('-')[0], session);

  await waitForDeployment(href);

  // get the content
  const response = await fetch(href);
  const content = await response.text();
  t.is(content.trim(), nonce);
});

test('try to deploy non-existing path', async t => {
  const goal = `> Error! The specified file or directory "${session}" does not exist.`;

  const { stderr, code } = await execa(binaryPath, [session, ...defaultArgs], {
    reject: false
  });

  t.is(code, 1);
  t.true(stderr.trim().endsWith(goal));
});

test('try to deploy with non-existing team', async t => {
  const target = fixture('node');
  const goal = `> Error! The specified team does not exist`;

  const { stderr, code } = await execa(
    binaryPath,
    [target, '--team', session, ...defaultArgs],
    {
      reject: false
    }
  );

  t.is(code, 1);
  t.true(stderr.includes(goal));
});

const createFile = (dest) => fs.closeSync(fs.openSync(dest, 'w'));
const createDirectory = (dest) => fs.mkdirSync(dest);
const verifyExampleApollo = (cwd, dir) => (
  fs.existsSync(path.join(cwd, dir, 'package.json'))
    && fs.existsSync(path.join(cwd, dir, 'now.json'))
    && fs.existsSync(path.join(cwd, dir, 'index.js'))
);

test('initialize example "apollo"', async t => {
  tmpDir = tmp.dirSync({ unsafeCleanup: true });
  const cwd = tmpDir.name;
  const goal = '> Success! Initialized "apollo" example in';

  const { stdout, code } = await execute(['init', 'apollo'], { cwd });

  t.is(code, 0);
  t.true(stdout.includes(goal));
  t.true(verifyExampleApollo(cwd, 'apollo'));
});

test('initialize example ("apollo") to specified directory', async t => {
  tmpDir = tmp.dirSync({ unsafeCleanup: true });
  const cwd = tmpDir.name;
  const goal = '> Success! Initialized "apollo" example in';

  const { stdout, code } = await execute(['init', 'apollo', 'apo'], { cwd });

  t.is(code, 0);
  t.true(stdout.includes(goal));
  t.true(verifyExampleApollo(cwd, 'apo'));
});

test('initialize selected example ("apollo")', async t => {
  tmpDir = tmp.dirSync({ unsafeCleanup: true });
  const cwd = tmpDir.name;
  const goal = '> Success! Initialized "apollo" example in';

  const { stdout, code } = await execute(['init'], { cwd, input: '\n' });

  t.is(code, 0);
  t.true(stdout.includes(goal));
  t.true(verifyExampleApollo(cwd, 'apollo'));
});

test('initialize example to existing directory with "-f"', async t => {
  tmpDir = tmp.dirSync({ unsafeCleanup: true });
  const cwd = tmpDir.name;
  const goal = '> Success! Initialized "apollo" example in';

  createDirectory(path.join(cwd, 'apollo'));
  createFile(path.join(cwd, 'apollo', '.gitignore'));
  const { stdout, code } = await execute(['init', 'apollo', '-f'], { cwd });

  t.is(code, 0);
  t.true(stdout.includes(goal));
  t.true(verifyExampleApollo(cwd, 'apollo'));
});

test('try to initialize example to existing directory', async t => {
  tmpDir = tmp.dirSync({ unsafeCleanup: true });
  const cwd = tmpDir.name;
  const goal = '> Error! Destination path "apollo" already exists and is not an empty directory.';

  createDirectory(path.join(cwd, 'apollo'));
  createFile(path.join(cwd, 'apollo', '.gitignore'));
  const { stdout, code } = await execute(['init', 'apollo'], { cwd, input: '\n' });

  t.is(code, 1);
  t.true(stdout.includes(goal));
});

test('try to initialize misspelled example (noce) in non-tty', async t => {
  tmpDir = tmp.dirSync({ unsafeCleanup: true });
  const cwd = tmpDir.name;
  const goal = '> Error! No example for noce.';

  const { stdout, code } = await execute(['init', 'noce'], { cwd });

  t.is(code, 1);
  t.true(stdout.includes(goal));
});

test('try to initialize example "example-404"', async t => {
  tmpDir = tmp.dirSync({ unsafeCleanup: true });
  const cwd = tmpDir.name;
  const goal = 'No example for example-404';

  const { stdout, code } = await execute(['init', 'example-404'], { cwd });

  t.is(code, 1);
  t.true(stdout.includes(goal));
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
