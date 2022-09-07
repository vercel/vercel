const fs = require('fs-extra');
const { join, resolve } = require('path');
const _execa = require('execa');
const fetch = require('node-fetch');
const retry = require('async-retry');
const { satisfies } = require('semver');
const stripAnsi = require('strip-ansi');
const { getDistTag } = require('../../src/util/get-dist-tag');
const { version: cliVersion } = require('../../package.json');
const {
  fetchCachedToken,
} = require('../../../../test/lib/deployment/now-deploy');

jest.setTimeout(6 * 60 * 1000);

const isCI = !!process.env.CI;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const isCanary = () => getDistTag(cliVersion) === 'canary';

let port = 3000;

const binaryPath = resolve(__dirname, `../../scripts/start.js`);
const fixture = name => join('test', 'dev', 'fixtures', name);
const fixtureAbsolute = name => join(__dirname, 'fixtures', name);
const exampleAbsolute = name =>
  join(__dirname, '..', '..', '..', '..', 'examples', name);

let processCounter = 0;
const processList = new Map();

function execa(...args) {
  const procId = ++processCounter;
  const child = _execa(...args);

  processList.set(procId, child);
  child.on('exit', () => processList.delete(procId));

  return child;
}

function fetchWithRetry(url, opts = {}) {
  return retry(
    async () => {
      const res = await fetch(url, opts);

      if (res.status !== opts.status) {
        const text = await res.text();
        throw new Error(
          `Failed to fetch ${url} with status ${res.status} (expected ${opts.status}):\n\n${text}\n\n`
        );
      }

      return res;
    },
    {
      retries: opts.retries ?? 3,
      factor: 1,
    }
  );
}

function createResolver() {
  let resolver;
  const p = new Promise(res => (resolver = res));
  p.resolve = resolver;
  return p;
}

function formatOutput({ stderr, stdout }) {
  return `Received:\n"${stderr}"\n"${stdout}"`;
}

function printOutput(fixture, stdout, stderr) {
  const lines = (
    `\nOutput for "${fixture}"\n` +
    `\n----- stdout -----\n` +
    stdout +
    `\n----- stderr -----\n` +
    stderr
  ).split('\n');

  const getPrefix = nr => {
    return nr === 0 ? '╭' : nr === lines.length - 1 ? '╰' : '│';
  };

  console.log(
    lines.map((line, index) => ` ${getPrefix(index)} ${line}`).join('\n')
  );
}

function shouldSkip(name, versions) {
  if (!satisfies(process.version, versions)) {
    console.log(`Skipping "${name}" because it requires "${versions}".`);
    return true;
  }

  return false;
}

function validateResponseHeaders(res, podId) {
  if (res.status < 500) {
    expect(res.headers.get('server')).toEqual('Vercel');
    expect(res.headers.get('cache-control').length > 0).toBeTruthy();
    expect(res.headers.get('x-vercel-id')).toBeTruthy();
    if (podId) {
      expect(
        res.headers.get('x-vercel-id').includes(`::${podId}-`)
      ).toBeTruthy();
    }
  }
}

async function exec(directory, args = []) {
  const token = await fetchCachedToken();
  return execa(
    binaryPath,
    [
      'dev',
      directory,
      '-t',
      token,
      ...(process.env.VERCEL_TEAM_ID
        ? ['--scope', process.env.VERCEL_TEAM_ID]
        : []),
      ...args,
    ],
    {
      reject: false,
      shell: true,
      env: { __VERCEL_SKIP_DEV_CMD: 1 },
    }
  );
}

async function runNpmInstall(fixturePath) {
  if (await fs.pathExists(join(fixturePath, 'package.json'))) {
    await execa('yarn', ['install'], {
      cwd: fixturePath,
      shell: true,
    });
  }
}

async function testPath(
  isDev,
  origin,
  status,
  path,
  expectedText,
  expectedHeaders = {},
  fetchOpts = {}
) {
  const opts = {
    retries: isCI ? 5 : 0,
    ...fetchOpts,
    redirect: 'manual-dont-change',
    status,
  };
  const url = `${origin}${path}`;
  const res = await fetchWithRetry(url, opts);
  const msg = `Testing response from ${fetchOpts.method || 'GET'} ${url}`;
  console.log(msg);
  expect(res.status).toBe(status);
  validateResponseHeaders(res);
  if (typeof expectedText === 'string') {
    const actualText = await res.text();
    expect(actualText.trim()).toBe(expectedText.trim());
  } else if (typeof expectedText === 'function') {
    const actualText = await res.text();
    await expectedText(actualText, res, isDev);
  } else if (expectedText instanceof RegExp) {
    const actualText = await res.text();
    expectedText.lastIndex = 0; // reset since we test twice
    expect(actualText).toMatch(expectedText);
  }
  if (expectedHeaders) {
    Object.entries(expectedHeaders).forEach(([key, expectedValue]) => {
      let actualValue = res.headers.get(key);
      if (key.toLowerCase() === 'location' && actualValue === '//') {
        // HACK: `node-fetch` has strange behavior for location header so fix it
        // with `manual-dont-change` opt and convert double slash to single.
        // See https://github.com/node-fetch/node-fetch/issues/417#issuecomment-587233352
        actualValue = '/';
      }
      expect(actualValue).toBe(expectedValue);
    });
  }
}

async function testFixture(directory, opts = {}, args = []) {
  await runNpmInstall(directory);

  const token = await fetchCachedToken();
  const dev = execa(
    binaryPath,
    [
      'dev',
      directory,
      '-t',
      token,
      ...(process.env.VERCEL_TEAM_ID
        ? ['--scope', process.env.VERCEL_TEAM_ID]
        : []),
      '-l',
      String(port),
      ...args,
    ],
    {
      reject: false,
      detached: true,
      shell: true,
      stdio: 'pipe',
      ...opts,
      env: { ...opts.env, __VERCEL_SKIP_DEV_CMD: 1 },
    }
  );

  let stdout = '';
  let stderr = '';
  const readyResolver = createResolver();
  const exitResolver = createResolver();

  dev.stdout.setEncoding('utf8');
  dev.stderr.setEncoding('utf8');

  dev.stdout.on('data', data => {
    stdout += data;
  });
  dev.stderr.on('data', data => {
    stderr += data;

    if (stripAnsi(stderr).includes('Ready! Available at')) {
      readyResolver.resolve();
    }
  });

  let printedOutput = false;

  dev.on('exit', () => {
    if (!printedOutput) {
      printOutput(directory, stdout, stderr);
      printedOutput = true;
    }
    exitResolver.resolve();
    readyResolver.resolve();
  });

  dev.on('error', () => {
    if (!printedOutput) {
      printOutput(directory, stdout, stderr);
      printedOutput = true;
    }
    exitResolver.resolve();
    readyResolver.resolve();
  });

  dev._kill = dev.kill;
  dev.kill = async (...args) => {
    dev._kill(...args);
    await exitResolver;
    return {
      stdout,
      stderr,
    };
  };

  return {
    dev,
    port,
    readyResolver,
  };
}

function testFixtureStdio(
  directory,
  fn,
  { expectedCode = 0, skipDeploy, isExample, projectSettings } = {}
) {
  return async () => {
    const nodeMajor = Number(process.versions.node.split('.')[0]);
    if (isExample && nodeMajor < 12) {
      console.log(`Skipping ${directory} on Node ${process.version}`);
      return;
    }
    const cwd = isExample
      ? exampleAbsolute(directory)
      : fixtureAbsolute(directory);
    const token = await fetchCachedToken();
    let deploymentUrl;

    // Deploy fixture and link project
    if (!skipDeploy) {
      const projectJsonPath = join(cwd, '.vercel', 'project.json');
      await fs.remove(projectJsonPath);
      const gitignore = join(cwd, '.gitignore');
      const hasGitignore = await fs.pathExists(gitignore);

      try {
        // Run `vc link`
        const linkResult = await execa(
          binaryPath,
          [
            '-t',
            token,
            ...(process.env.VERCEL_TEAM_ID
              ? ['--scope', process.env.VERCEL_TEAM_ID]
              : []),
            'link',
            '--yes',
          ],
          { cwd, stdio: 'pipe', reject: false }
        );
        console.log({
          stderr: linkResult.stderr,
          stdout: linkResult.stdout,
        });
        expect(linkResult.exitCode).toBe(0);

        // Patch the project with any non-default properties
        if (projectSettings) {
          const { projectId } = await fs.readJson(projectJsonPath);
          const res = await fetchWithRetry(
            `https://api.vercel.com/v2/projects/${projectId}${
              process.env.VERCEL_TEAM_ID
                ? `?teamId=${process.env.VERCEL_TEAM_ID}`
                : ''
            }`,
            {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(projectSettings),
              retries: isCI ? 3 : 0,
              status: 200,
            }
          );
          expect(res.status).toBe(200);
        }

        // Run `vc deploy`
        let deployResult = await execa(
          binaryPath,
          [
            '-t',
            token,
            ...(process.env.VERCEL_TEAM_ID
              ? ['--scope', process.env.VERCEL_TEAM_ID]
              : []),
            'deploy',
            ...(process.env.VERCEL_CLI_VERSION
              ? [
                  '--build-env',
                  `VERCEL_CLI_VERSION=${process.env.VERCEL_CLI_VERSION}`,
                ]
              : []),
            '--public',
            '--debug',
          ],
          { cwd, stdio: 'pipe', reject: false }
        );
        console.log({
          exitCode: deployResult.exitCode,
          stdout: deployResult.stdout,
          stderr: deployResult.stderr,
        });
        expect(deployResult.exitCode).toBe(expectedCode);
        if (expectedCode === 0) {
          deploymentUrl = new URL(deployResult.stdout).host;
        }
      } finally {
        if (!hasGitignore) {
          await fs.remove(gitignore);
        }
      }
    }

    // Start dev
    let dev;

    await runNpmInstall(cwd);

    let stdout = '';
    let stderr = '';
    const readyResolver = createResolver();
    const exitResolver = createResolver();

    try {
      let printedOutput = false;

      const env = skipDeploy
        ? { ...process.env, __VERCEL_SKIP_DEV_CMD: 1 }
        : process.env;
      dev = execa(
        binaryPath,
        [
          'dev',
          '-l',
          port,
          '-t',
          token,
          ...(process.env.VERCEL_TEAM_ID
            ? ['--scope', process.env.VERCEL_TEAM_ID]
            : []),
          '--debug',
        ],
        {
          cwd,
          env,
        }
      );

      dev.stdout.setEncoding('utf8');
      dev.stderr.setEncoding('utf8');

      dev.stdout.pipe(process.stdout);
      dev.stderr.pipe(process.stderr);

      dev.stdout.on('data', data => {
        stdout += data;
      });

      dev.stderr.on('data', data => {
        stderr += data;

        if (stripAnsi(data).includes('Ready! Available at')) {
          readyResolver.resolve();
        }

        if (stderr.includes(`Requested port ${port} is already in use`)) {
          dev.kill('SIGTERM');
          throw new Error(
            `Failed for "${directory}" with port ${port} with stderr "${stderr}".`
          );
        }

        if (stderr.includes('Command failed')) {
          dev.kill('SIGTERM');
          throw new Error(`Failed for "${directory}" with stderr "${stderr}".`);
        }
      });

      dev.on('exit', () => {
        if (!printedOutput) {
          printOutput(directory, stdout, stderr);
          printedOutput = true;
        }
        exitResolver.resolve();
      });

      dev.on('error', () => {
        if (!printedOutput) {
          printOutput(directory, stdout, stderr);
          printedOutput = true;
        }
        exitResolver.resolve();
      });

      await readyResolver;

      const helperTestPath = async (...args) => {
        if (!skipDeploy) {
          await testPath(false, `https://${deploymentUrl}`, ...args);
        }
        await testPath(true, `http://localhost:${port}`, ...args);
      };
      await fn(helperTestPath, port);
    } finally {
      dev.kill('SIGTERM');
      await exitResolver;
    }
  };
}

beforeEach(() => {
  port = ++port;
});

afterEach(async () => {
  await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Array.from(processList).map(([_procId, proc]) => {
      if (proc.killed === false) {
        console.log(
          `killing process ${proc.pid} "${proc.spawnargs.join(' ')}"`
        );

        try {
          process.kill(proc.pid, 'SIGTERM');
        } catch (err) {
          // Was already killed
          console.error(`Failed to kill process`, proc.pid, err);
        }
      }
    })
  );
});

module.exports = {
  sleep,
  isCanary,
  testPath,
  testFixture,
  testFixtureStdio,
  exec,
  formatOutput,
  shouldSkip,
  fixture,
  fetch,
  validateResponseHeaders,
};
